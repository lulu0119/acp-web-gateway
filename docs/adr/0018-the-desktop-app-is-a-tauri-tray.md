# The desktop app is a Tauri tray that runs the daemon

A device needs a desktop presence on macOS, Windows, and Linux: whether the daemon is running, which relays the device is signed in to, and a place to edit its agent configurations. The desktop app is Tauri. Its tray is built in Rust and stays resident. Its settings window is created when opened and destroyed when closed, so no webview stays in memory while the person is not looking at it.

The app starts the daemon. It starts at login, runs one `exterior daemon` child per sign-in from the executable of [ADR 0017](0017-the-daemon-ships-as-one-executable.md) shipped beside it, and starts a child again when it exits on its own. Quitting the app stops the daemons. This is the shape of Ollama's app and opencodex's desktop app: the app owns the process, so it knows whether it runs without asking anyone. The app acts only through the executable's commands, which print JSON for it, so the app never reads the daemon's files itself. A Linux server without a desktop runs `exterior daemon` under a systemd user unit the person writes, as Syncthing documents.

Agent configurations are edited on the device only. The relay dashboard lists them and never changes them, because a configuration names a command the device runs, and a relay that could write one could run any command on every device signed in to it.

Measured with a throwaway prototype on Windows on 2026-10-15: the tray executable is 3.2 MB and holds 31 MB working set, 6 MB of it private. An open window adds six WebView2 processes and 159 MB of private memory, and all six exit when it closes.

## Considered Options

- **The system starts the daemon as a per-user login item, and the app is its client.** Rejected after building part of it. It needed an installer for launchd, systemd, and the Windows Task Scheduler. On Windows a logon task opens a console window unless it runs through an undocumented `conhost --headless`, loses the exit code, and does not restart a daemon that crashed. A daemon whose sign-in was rejected had to wait in place instead of exiting, or the system would restart it in a loop. No desktop app we studied works this way; cloudflared, ngrok, and Tailscale install system services, which need an administrator.
- **Electron.** Rejected. A bundled Chromium kept resident for a tray.
- **A native app per platform (SwiftUI, C#, and something for Linux).** Rejected. Three interfaces for two people, and the Linux desktop had no owner.
- **Create the tray from Tauri's JavaScript API.** Rejected. That tray belongs to the webview, which closing the window destroys.
- **Edit configurations from the relay dashboard.** Rejected, for the reason above.

## Consequences

- Quitting the app takes the device offline. The tray says so in the Quit item.
- A second `exterior daemon` for the same relay, started by hand beside the app's, is refused, so one relay never gets two connections from one device.
- An app started at login on macOS gets launchd's minimal `PATH`, so the daemon reads the person's login shell `PATH` before it starts agents.
- Without an Apple Developer ID signature and notarization, Gatekeeper blocks the downloaded app, and Homebrew's official casks disabled apps that fail Gatekeeper on 2026-09-01. Until there is an account, the macOS app is for testers. Windows shows a SmartScreen warning for an unsigned installer.
- GNOME without the AppIndicator extension shows no tray, and a missing libappindicator makes the tray panic. When no tray is available, the app opens its window and closing it quits.
