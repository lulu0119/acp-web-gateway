//! The window exists only while it is open. Closing it destroys the webview, and the
//! tray keeps the app running (ADR 0018).

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Exterior")
        .inner_size(760.0, 640.0)
        .min_inner_size(520.0, 480.0)
        .build();
}

/// Whether this desktop shows tray icons. A Linux desktop may have no StatusNotifier host,
/// as stock GNOME has none, and the tray then builds without error but never appears.
pub fn tray_is_shown() -> bool {
    #[cfg(target_os = "linux")]
    {
        // gdbus ships with GLib, which the webview already needs.
        let answer = std::process::Command::new("gdbus")
            .args([
                "call", "--session", "--dest", "org.freedesktop.DBus", "--object-path", "/org/freedesktop/DBus",
                "--method", "org.freedesktop.DBus.NameHasOwner", "org.kde.StatusNotifierWatcher",
            ])
            .output();
        return matches!(answer, Ok(output) if String::from_utf8_lossy(&output.stdout).contains("true"));
    }
    #[allow(unreachable_code)]
    true
}
