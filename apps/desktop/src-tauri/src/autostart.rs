//! Start at login. On Windows the app writes its own `HKCU\…\Run` value with a quoted path,
//! as opencodex does, because the autostart plugin tries HKLM first and leaves the path
//! unquoted. macOS (a LaunchAgent) and Linux (an XDG autostart entry) use the plugin.

use tauri::AppHandle;

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const VALUE: &str = "Exterior";

#[cfg(windows)]
pub fn enabled(_app: &AppHandle) -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(RUN_KEY)
        .and_then(|key| key.get_value::<String, _>(VALUE))
        .is_ok()
}

#[cfg(windows)]
pub fn set(_app: &AppHandle, enable: bool) {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let Ok((key, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(RUN_KEY) else { return };
    if enable {
        if let Ok(path) = std::env::current_exe() {
            let _ = key.set_value(VALUE, &format!("\"{}\" --autostart", path.display()));
        }
    } else {
        let _ = key.delete_value(VALUE);
    }
}

#[cfg(not(windows))]
pub fn enabled(app: &AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[cfg(not(windows))]
pub fn set(app: &AppHandle, enable: bool) {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let _ = if enable { manager.enable() } else { manager.disable() };
}

/// Turns start at login on the first time the app runs, as Ollama does, and leaves the
/// person's later choice alone.
pub fn first_run(app: &AppHandle) {
    let marker = crate::state_directory().join("desktop-autostart-offered");
    if marker.exists() {
        return;
    }
    set(app, true);
    let _ = std::fs::create_dir_all(crate::state_directory());
    let _ = std::fs::write(marker, "");
}
