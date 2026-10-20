//! The window exists only while it is open. Closing it destroys the webview, and the
//! tray keeps the app running (ADR 0018). On macOS the open window is a normal app,
//! so it is in the Dock and in Command-Tab; closing it returns to the menu bar.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn open(app: &AppHandle) {
    // From the tray the app is an accessory without a Dock tile and inactive,
    // so its window would draw gray until a click. Become foreground instead.
    #[cfg(target_os = "macos")]
    if !app.state::<crate::WindowIsTheApp>().0 {
        become_foreground(app);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    // The page draws the sidebar to the top edge. On macOS the traffic lights sit in
    // that corner, so the title bar is an overlay and its title is hidden.
    let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Exterior")
        .inner_size(960.0, 680.0)
        .min_inner_size(760.0, 520.0);
    #[cfg(target_os = "macos")]
    {
        window = window.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    }
    let _ = window.build();
}

/// The window is gone and the desktop has a tray: leave the Dock.
pub fn returned_to_menu_bar(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    if !app.state::<crate::WindowIsTheApp>().0 {
        let _ = app.set_dock_visibility(false);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// Shows the app in the Dock and activates it, so the window draws active.
/// Transforming an already foreground app confuses the Dock and blanks its
/// tile, so only transform out of Accessory. Tauri exposes neither the current
/// policy nor runtime activation, so this asks NSApplication directly. The
/// person asked for the window through the tray, a menu, or a second launch,
/// so activate regardless.
#[cfg(target_os = "macos")]
fn become_foreground(app: &AppHandle) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let application = NSApplication::sharedApplication(mtm);
    if application.activationPolicy() != NSApplicationActivationPolicy::Regular {
        let _ = app.set_dock_visibility(true);
    }
    // activateIgnoringOtherApps works on every macOS Tauri supports; the newer
    // activate needs macOS 14.
    #[allow(deprecated)]
    application.activateIgnoringOtherApps(true);
}

/// Starts a window drag from whatever native event is current.
/// `performWindowDragWithEvent` ignores anything but a left mouse down, and by the time the
/// page's click reaches here the event is often already a drag or a trackpad press.
#[cfg(target_os = "macos")]
pub fn drag(window: &tauri::WebviewWindow) {
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSEvent, NSEventModifierFlags, NSEventType, NSWindow};

    let Some(marker) = MainThreadMarker::new() else {
        return;
    };
    let current = NSApplication::sharedApplication(marker).currentEvent();
    let Ok(pointer) = window.ns_window() else {
        return;
    };
    let Some(ns_window) = (unsafe { Retained::<NSWindow>::retain(pointer.cast()) }) else {
        return;
    };
    // The call arrives after mouseDown has returned, so the original event no longer drags.
    let flags = current.as_ref().map(|event| event.modifierFlags()).unwrap_or(NSEventModifierFlags(0));
    let timestamp = current.as_ref().map(|event| event.timestamp()).unwrap_or(0.0);
    let Some(event) = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        NSEventType::LeftMouseDown,
        ns_window.convertPointFromScreen(NSEvent::mouseLocation()),
        flags,
        timestamp,
        ns_window.windowNumber(),
        None,
        0,
        1,
        1.0,
    ) else {
        return;
    };
    ns_window.performWindowDragWithEvent(&event);
}

/// Whether this desktop shows tray icons. A Linux desktop may have no StatusNotifier host,
/// as stock GNOME has none, and the tray then builds without error but never appears.
pub fn tray_is_shown() -> bool {
    #[cfg(target_os = "linux")]
    {
        // gdbus ships with GLib, which the webview already needs.
        let answer = std::process::Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.freedesktop.DBus",
                "--object-path",
                "/org/freedesktop/DBus",
                "--method",
                "org.freedesktop.DBus.NameHasOwner",
                "org.kde.StatusNotifierWatcher",
            ])
            .output();
        return matches!(answer, Ok(output) if String::from_utf8_lossy(&output.stdout).contains("(true,"));
    }
    #[allow(unreachable_code)]
    true
}
