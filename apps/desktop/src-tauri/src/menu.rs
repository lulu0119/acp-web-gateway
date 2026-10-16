//! The macOS menu bar. Text shortcuts reach the webview only through the Edit menu.
//! The tray menu is separate and stays with the icon.

#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::AppHandle;

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let quit = MenuItem::with_id(
            app,
            "app-quit",
            crate::tray::QUIT_ITEM,
            true,
            Some("CmdOrCtrl+Q"),
        )?;
        let application = Submenu::with_items(
            app,
            "Exterior",
            true,
            &[
                &PredefinedMenuItem::about(app, None, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &quit,
            ],
        )?;
        let edit = Submenu::with_items(
            app,
            "Edit",
            true,
            &[
                &PredefinedMenuItem::undo(app, None)?,
                &PredefinedMenuItem::redo(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::cut(app, None)?,
                &PredefinedMenuItem::copy(app, None)?,
                &PredefinedMenuItem::paste(app, None)?,
                &PredefinedMenuItem::select_all(app, None)?,
            ],
        )?;
        let window = Submenu::with_items(
            app,
            "Window",
            true,
            &[&PredefinedMenuItem::close_window(app, None)?],
        )?;
        app.set_menu(Menu::with_items(app, &[&application, &edit, &window])?)?;
        Ok(())
    }
}
