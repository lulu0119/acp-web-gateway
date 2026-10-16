#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autostart;
mod cli;
mod daemons;
mod menu;
mod tray;
mod window;

use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tauri_plugin_opener::OpenerExt;

use daemons::{Daemons, RelayView};

/// Set when the desktop shows no tray: the window is then the app, and closing it quits.
pub struct WindowIsTheApp(pub bool);

/// Set while a window close is destroying the webview, so that close is not taken as quitting.
pub struct SuppressExit(AtomicBool);

impl SuppressExit {
    pub fn arm(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn take(&self) -> bool {
        self.0.swap(false, Ordering::SeqCst)
    }
}

static QUITTING: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct SignIn(Mutex<Option<Child>>);

pub fn state_directory() -> PathBuf {
    std::env::home_dir()
        .unwrap_or_default()
        .join(".local")
        .join("state")
        .join("exterior")
}

/// The daemons' stderr, for finding out later why one failed. Started over past 5 MB.
pub fn log_file() -> Option<File> {
    let path = state_directory().join("desktop.log");
    std::fs::create_dir_all(state_directory()).ok()?;
    let fresh = std::fs::metadata(&path)
        .map(|metadata| metadata.len() > 5_000_000)
        .unwrap_or(false);
    OpenOptions::new()
        .create(true)
        .append(!fresh)
        .write(true)
        .truncate(fresh)
        .open(path)
        .ok()
}

pub fn quit(app: &AppHandle) {
    if QUITTING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        app.state::<Daemons>().stop_all();
        app.exit(0);
    });
}

#[tauri::command]
fn relays(daemons: State<Daemons>) -> Vec<RelayView> {
    daemons.views()
}

#[tauri::command]
fn device_name() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

#[tauri::command]
async fn agents() -> Result<serde_json::Value, String> {
    cli::run_json(&["agent-config", "list", "--json"])
}

#[tauri::command]
async fn agent_types() -> Result<serde_json::Value, String> {
    cli::run_json(&["agent-config", "types", "--json"])
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewAgent {
    agent_type: Option<String>,
    command: Option<String>,
    name: Option<String>,
    env: Vec<(String, String)>,
}

/// A running daemon picks the change up from the configuration file.
#[tauri::command]
async fn create_agent(agent: NewAgent) -> Result<(), String> {
    let mut args: Vec<String> = vec!["agent-config".into(), "create".into()];
    match (agent.agent_type, agent.command) {
        (Some(agent_type), None) => args.extend(["--agent-type".into(), agent_type]),
        (None, Some(command)) => args.extend(["--command".into(), command]),
        _ => return Err("Choose an agent type or enter a command.".into()),
    }
    if let Some(name) = agent.name.filter(|name| !name.trim().is_empty()) {
        args.extend(["--name".into(), name]);
    }
    for (key, value) in agent.env {
        args.extend(["--env".into(), format!("{key}={value}")]);
    }
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    cli::run(&args).map(|_| ())
}

#[tauri::command]
async fn remove_agent(name: String) -> Result<(), String> {
    cli::run(&["agent-config", "remove", "--name", &name]).map(|_| ())
}

/// Runs `exterior login --json` and forwards its lines as `sign-in` events. The browser
/// opens on the code page; the window shows the code to compare.
#[tauri::command]
fn sign_in(app: AppHandle, state: State<SignIn>, relay: String) -> Result<(), String> {
    let mut current = state.0.lock().unwrap();
    if let Some(mut previous) = current.take() {
        let _ = previous.kill();
    }
    let mut child = cli::command(["login", "--relay", &relay, "--json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start exterior: {error}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *current = Some(child);
    drop(current);
    std::thread::spawn(move || {
        let mut finished = false;
        if let Some(stdout) = stdout {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) else {
                    continue;
                };
                match event["event"].as_str() {
                    Some("code") => {
                        if let Some(url) = event["verificationUri"].as_str() {
                            let _ = app.opener().open_url(url, None::<&str>);
                        }
                    }
                    Some("signed-in") => {
                        finished = true;
                        let _ = app.state::<Daemons>().reconcile(&app);
                    }
                    Some("failed") => finished = true,
                    _ => {}
                }
                let _ = app.emit("sign-in", event);
            }
        }
        if !finished {
            // Cancelled, or exterior refused before it began, such as an address that is not a relay.
            // The first line says why; progress lines and the CLI's pointer to --help do not.
            let reason = stderr
                .map(|stderr| {
                    BufReader::new(stderr)
                        .lines()
                        .map_while(Result::ok)
                        .find(|line| {
                            !line.trim().is_empty()
                                && !line.starts_with("Signing in to ")
                                && !line.starts_with("Run `exterior")
                        })
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            let _ = app.emit(
                "sign-in",
                serde_json::json!({ "event": "ended", "message": reason }),
            );
        }
        app.state::<SignIn>().0.lock().unwrap().take();
    });
    Ok(())
}

#[tauri::command]
fn cancel_sign_in(state: State<SignIn>) {
    if let Some(mut child) = state.0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

#[tauri::command]
async fn sign_out(app: AppHandle, relay: String) -> Result<(), String> {
    let daemons = app.state::<Daemons>();
    daemons.stop(&app, &relay, true);
    let result = cli::run(&["logout", "--relay", &relay]).map(|_| ());
    let _ = daemons.reconcile(&app);
    result
}

#[tauri::command]
fn start_daemon(app: AppHandle, daemons: State<Daemons>, relay: String) {
    daemons.start(&app, &relay);
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only web addresses open from here.".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

fn main() {
    let builder = tauri::Builder::default()
        // First, so a second launch only opens the window of the running one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::open(app)
        }))
        .plugin(tauri_plugin_opener::init());
    #[cfg(not(windows))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--autostart"]),
    ));
    let app = builder
        .manage(Daemons::default())
        .manage(SignIn::default())
        .manage(SuppressExit(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![
            relays,
            device_name,
            agents,
            agent_types,
            create_agent,
            remove_agent,
            sign_in,
            cancel_sign_in,
            sign_out,
            start_daemon,
            open_url
        ])
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "app-quit" {
                quit(app);
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            let window_is_the_app = !window::tray_is_shown();
            app.manage(WindowIsTheApp(window_is_the_app));
            if !window_is_the_app {
                tray::build(&handle)?;
            }
            menu::install(&handle)?;
            autostart::first_run(&handle);
            let daemons = app.state::<Daemons>().inner().clone();
            std::thread::spawn(move || {
                if let Err(message) = daemons.reconcile(&handle) {
                    let _ = handle.emit("app-error", message);
                }
            });
            // Started at login, the app waits in the tray; opened by the person, it shows itself.
            if window_is_the_app || !std::env::args().any(|arg| arg == "--autostart") {
                window::open(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("build the Exterior app");

    app.run(|app, event| match event {
        // The runtime exits when the last window is destroyed. With a tray, closing the window
        // is not quitting, so that exit is declined.
        RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { .. },
            ..
        } if label == "main" && !app.state::<WindowIsTheApp>().0 => {
            app.state::<SuppressExit>().arm();
        }
        RunEvent::ExitRequested {
            code: None, api, ..
        } => {
            api.prevent_exit();
            if app.state::<SuppressExit>().take() {
                window::returned_to_menu_bar(app);
            } else {
                quit(app);
            }
        }
        _ => {}
    });
}
