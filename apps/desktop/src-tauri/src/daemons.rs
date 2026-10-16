//! One `exterior daemon` child per sign-in, as Ollama's app runs `ollama serve` (ADR 0018).
//!
//! A child that exits on its own is started again after a delay, except when its exit code
//! says that cannot help: 3 means the relay rejected the sign-in, and 4 means another daemon
//! already serves that relay, which is checked again later.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::cli;

const SIGN_IN_REQUIRED: i32 = 3;
const ALREADY_RUNNING: i32 = 4;
const ELSEWHERE_RETRY: Duration = Duration::from_secs(15);
const STOP_GRACE: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    /// The child runs; `state` says whether it is connected.
    Running,
    /// The child exited on its own and starts again at `retryAt`.
    Restarting,
    /// The relay rejected this device's sign-in. Nothing restarts it until the person signs in.
    SignInRequired,
    /// Another daemon, started outside the app, serves this relay.
    Elsewhere,
    /// The person stopped it.
    Stopped,
}

/// What the window and the tray show for one relay.
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RelayView {
    pub relay_url: String,
    pub phase: Phase,
    /// The daemon's last JSON state line, as `exterior daemon --json` printed it.
    pub state: Option<serde_json::Value>,
    /// Why the child last exited, from its stderr.
    pub error: Option<String>,
    pub retry_at: Option<u64>,
}

struct Entry {
    view: RelayView,
    /// Bumped on every start and stop, so threads of an older child leave the entry alone.
    generation: u64,
    stdin: Option<ChildStdin>,
    child: Option<Arc<Mutex<Child>>>,
    failures: u32,
}

#[derive(Clone, Default)]
pub struct Daemons {
    entries: Arc<Mutex<HashMap<String, Entry>>>,
}

impl Daemons {
    pub fn views(&self) -> Vec<RelayView> {
        let entries = self.entries.lock().unwrap();
        let mut views: Vec<RelayView> = entries.values().map(|entry| entry.view.clone()).collect();
        views.sort_by(|a, b| a.relay_url.cmp(&b.relay_url));
        views
    }

    /// Runs a daemon for each sign-in and stops the ones whose sign-in is gone.
    pub fn reconcile(&self, app: &AppHandle) -> Result<(), String> {
        let status = cli::run_json(&["status", "--json"])?;
        let relays: Vec<String> = status["relays"]
            .as_array()
            .map(|relays| relays.iter().filter_map(|relay| relay["relayUrl"].as_str().map(String::from)).collect())
            .unwrap_or_default();
        let known: Vec<String> = self.entries.lock().unwrap().keys().cloned().collect();
        for relay in known.iter().filter(|relay| !relays.contains(relay)) {
            self.stop(app, relay, true);
        }
        for relay in relays {
            let phase = self.entries.lock().unwrap().get(&relay).map(|entry| entry.view.phase);
            // A new sign-in replaced the rejected one.
            if matches!(phase, None | Some(Phase::SignInRequired)) {
                self.start(app, &relay);
            }
        }
        changed(app, self);
        Ok(())
    }

    pub fn start(&self, app: &AppHandle, relay: &str) {
        let spawned = cli::command(["daemon", "--relay", relay, "--json", "--stop-when-stdin-closes"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();
        let mut entries = self.entries.lock().unwrap();
        let entry = entries.entry(relay.to_string()).or_insert_with(|| Entry {
            view: RelayView { relay_url: relay.to_string(), phase: Phase::Running, state: None, error: None, retry_at: None },
            generation: 0,
            stdin: None,
            child: None,
            failures: 0,
        });
        entry.generation += 1;
        entry.view.retry_at = None;
        let mut child = match spawned {
            Ok(child) => child,
            Err(error) => {
                entry.view.phase = Phase::Stopped;
                entry.view.error = Some(format!("Could not start exterior: {error}"));
                drop(entries);
                changed(app, self);
                return;
            }
        };
        entry.view.phase = Phase::Running;
        entry.view.error = None;
        entry.stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child = Arc::new(Mutex::new(child));
        entry.child = Some(child.clone());
        let generation = entry.generation;
        drop(entries);
        changed(app, self);

        if let Some(stdout) = stdout {
            let (daemons, app, relay) = (self.clone(), app.clone(), relay.to_string());
            thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    let Ok(state) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
                    daemons.update(&relay, generation, |entry| {
                        let connected = state["status"].as_str() == Some("connected");
                        entry.view.state = Some(state);
                        // A connection that held resets the backoff.
                        if connected {
                            entry.failures = 0;
                        }
                    });
                    changed(&app, &daemons);
                }
            });
        }
        let last_error = Arc::new(Mutex::new(None::<String>));
        if let Some(stderr) = stderr {
            let last_error = last_error.clone();
            let relay = relay.to_string();
            thread::spawn(move || {
                let mut log = crate::log_file();
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    if let Some(log) = log.as_mut() {
                        let _ = writeln!(log, "[{relay}] {line}");
                    }
                    // Keep the reason without the timestamp and tag the daemon puts in front.
                    let reason = line.split_once("[exterior] ").map(|(_, rest)| rest).unwrap_or(&line).trim().to_string();
                    if !reason.is_empty() {
                        *last_error.lock().unwrap() = Some(reason);
                    }
                }
            });
        }
        let (daemons, app, relay) = (self.clone(), app.clone(), relay.to_string());
        thread::spawn(move || {
            let code = wait(&child);
            let reason = last_error.lock().unwrap().clone();
            daemons.exited(&app, &relay, generation, code, reason);
        });
    }

    fn exited(&self, app: &AppHandle, relay: &str, generation: u64, code: Option<i32>, reason: Option<String>) {
        let mut retry = None;
        self.update(relay, generation, |entry| {
            entry.stdin = None;
            entry.child = None;
            entry.view.error = reason;
            match code {
                Some(SIGN_IN_REQUIRED) => entry.view.phase = Phase::SignInRequired,
                Some(ALREADY_RUNNING) => {
                    entry.view.phase = Phase::Elsewhere;
                    entry.view.error = None;
                    retry = Some(ELSEWHERE_RETRY);
                }
                _ => {
                    entry.failures += 1;
                    entry.view.phase = Phase::Restarting;
                    retry = Some(Duration::from_secs(1 << entry.failures.min(5).saturating_sub(1)));
                }
            }
            if let Some(delay) = retry {
                entry.view.retry_at = Some(now_ms() + delay.as_millis() as u64);
            }
        });
        changed(app, self);
        if let Some(delay) = retry {
            let (daemons, app, relay) = (self.clone(), app.clone(), relay.to_string());
            thread::spawn(move || {
                thread::sleep(delay);
                let current = daemons.entries.lock().unwrap().get(&relay).map(|entry| entry.generation);
                if current == Some(generation) {
                    daemons.start(&app, &relay);
                }
            });
        }
    }

    /// Stops a relay's daemon by closing its stdin, which lets it stop its agents, and
    /// kills it if it is still running after a grace period. `forget` drops the relay.
    pub fn stop(&self, app: &AppHandle, relay: &str, forget: bool) {
        let child = {
            let mut entries = self.entries.lock().unwrap();
            let Some(entry) = entries.get_mut(relay) else { return };
            entry.generation += 1;
            entry.stdin = None;
            entry.view.phase = Phase::Stopped;
            entry.view.retry_at = None;
            entry.view.error = None;
            let child = entry.child.take();
            if forget {
                entries.remove(relay);
            }
            child
        };
        if let Some(child) = child {
            thread::spawn(move || {
                let deadline = Instant::now() + STOP_GRACE;
                while Instant::now() < deadline {
                    if matches!(child.lock().unwrap().try_wait(), Ok(Some(_))) {
                        return;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                let _ = child.lock().unwrap().kill();
            });
        }
        changed(app, self);
    }

    /// Stops every daemon and waits for them, for quitting the app.
    pub fn stop_all(&self) {
        let children: Vec<Arc<Mutex<Child>>> = {
            let mut entries = self.entries.lock().unwrap();
            entries
                .values_mut()
                .filter_map(|entry| {
                    entry.generation += 1;
                    entry.stdin = None;
                    entry.child.take()
                })
                .collect()
        };
        let deadline = Instant::now() + STOP_GRACE;
        for child in children {
            while Instant::now() < deadline {
                if matches!(child.lock().unwrap().try_wait(), Ok(Some(_))) {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            let _ = child.lock().unwrap().kill();
        }
    }

    fn update(&self, relay: &str, generation: u64, change: impl FnOnce(&mut Entry)) {
        let mut entries = self.entries.lock().unwrap();
        if let Some(entry) = entries.get_mut(relay) {
            if entry.generation == generation {
                change(entry);
            }
        }
    }
}

/// Waits for a child without holding its lock, so `stop` can kill it meanwhile.
fn wait(child: &Arc<Mutex<Child>>) -> Option<i32> {
    loop {
        if let Ok(Some(status)) = child.lock().unwrap().try_wait() {
            return status.code();
        }
        thread::sleep(Duration::from_millis(250));
    }
}

fn changed(app: &AppHandle, daemons: &Daemons) {
    let views = daemons.views();
    crate::tray::show(app, &views);
    let _ = app.emit("relays-changed", &views);
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_millis() as u64).unwrap_or(0)
}
