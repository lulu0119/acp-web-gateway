//! The tray stays resident while no window exists. Items keep their handles and change
//! with `set_text`: rebuilding a menu while it is open crashes on macOS.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::daemons::{Phase, RelayView};

pub struct Tray {
    status: MenuItem<Wry>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "Starting…", false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Exterior", true, None::<&str>)?;
    let login = CheckMenuItem::with_id(app, "login", "Start at Login", true, crate::autostart::enabled(app), None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Exterior", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&status, &PredefinedMenuItem::separator(app)?, &open, &login, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    app.manage(Tray { status });
    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("the bundle has an icon"))
        .tooltip("Exterior")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => crate::window::open(app),
            "login" => {
                let enable = !crate::autostart::enabled(app);
                crate::autostart::set(app, enable);
                let _ = login.set_checked(crate::autostart::enabled(app));
            }
            "quit" => crate::quit(app),
            _ => {}
        })
        // Linux tray hosts deliver no clicks, so there the menu is the only way in.
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::window::open(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn show(app: &AppHandle, views: &[RelayView]) {
    let text = summary(views);
    if let Some(tray) = app.try_state::<Tray>() {
        let _ = tray.status.set_text(&text);
    }
    if let Some(icon) = app.tray_by_id("tray") {
        let _ = icon.set_tooltip(Some(format!("Exterior: {text}")));
    }
}

/// One line for the whole device: the relay that needs the person first, then progress.
fn summary(views: &[RelayView]) -> String {
    if views.is_empty() {
        return "Not signed in to a relay".into();
    }
    if let Some(view) = views.iter().find(|view| view.phase == Phase::SignInRequired) {
        return format!("Sign in again to {}", host(&view.relay_url));
    }
    let connected = views.iter().filter(|view| is_connected(view)).count();
    if connected == views.len() {
        return match views {
            [only] => format!("Connected to {}", host(&only.relay_url)),
            _ => format!("Connected to {} relays", views.len()),
        };
    }
    if let Some(view) = views.iter().find(|view| view.phase == Phase::Elsewhere) {
        return format!("{} is served by another daemon", host(&view.relay_url));
    }
    if views.iter().all(|view| view.phase == Phase::Stopped) {
        return "Stopped".into();
    }
    let waiting = views.iter().find(|view| !is_connected(view) && view.phase != Phase::Stopped).unwrap_or(&views[0]);
    format!("Connecting to {}…", host(&waiting.relay_url))
}

fn is_connected(view: &RelayView) -> bool {
    view.phase == Phase::Running && view.state.as_ref().and_then(|state| state["status"].as_str()) == Some("connected")
}

fn host(relay_url: &str) -> &str {
    relay_url.split_once("://").map(|(_, rest)| rest).unwrap_or(relay_url)
}
