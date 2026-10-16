//! The app acts only through the `exterior` executable shipped beside it (ADR 0018),
//! which prints JSON for it. The app never reads the daemon's files itself.

use std::path::PathBuf;
use std::process::{Command, Stdio};

pub fn executable() -> PathBuf {
    let directory = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(PathBuf::from))
        .unwrap_or_default();
    directory.join(if cfg!(windows) { "exterior.exe" } else { "exterior" })
}

/// A command for the `exterior` executable that opens no console window.
pub fn command<I, S>(args: I) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let mut command = Command::new(executable());
    command.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Runs a command to completion. Ok holds stdout; Err holds what it printed on stderr.
pub fn run(args: &[&str]) -> Result<String, String> {
    let output = command(args).output().map_err(|error| format!("Could not start exterior: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() { "exterior failed without saying why.".into() } else { stderr })
    }
}

pub fn run_json(args: &[&str]) -> Result<serde_json::Value, String> {
    let text = run(args)?;
    serde_json::from_str(&text).map_err(|error| format!("exterior printed something that is not JSON: {error}"))
}
