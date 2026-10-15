# The desktop app is a Tauri tray

A device needs a desktop presence on macOS, Windows, and Linux: whether the daemon is running, which relays the device is signed in to, and a place to edit its agent configurations. The desktop app is Tauri. Its tray is built in Rust and stays resident. Its settings window is created when opened and destroyed when closed, so no webview stays in memory while the person is not looking at it. The daemon stays a separate process, the executable from [ADR 0017](0017-the-daemon-ships-as-one-executable.md), shipped beside the app. The app acts through that executable's commands, so a Linux server without a desktop runs the same daemon without the app.

The system starts the daemon, not the app. Each sign-in gets a per-user login item: a launchd agent on macOS, a systemd user unit on Linux, a logon task on Windows. These run as the person, because agents need their home directory, `PATH`, and credentials. The daemon commands install, remove, start, and stop that item, and the app calls those same commands. Quitting the app leaves the daemon running; stopping the daemon is a separate menu item. The daemon reports its state in a file, which the app reads through `exterior status --json` so that only the daemon's own code knows the file's shape. The daemon picks up configuration changes by watching its configuration file, so v1 needs no channel from the app to the daemon.

Agent configurations are edited on the device only. The relay dashboard lists them and never changes them, because a configuration names a command the device runs, and a relay that could write one could run any command on every device signed in to it.

Measured with a throwaway prototype on Windows on 2026-10-15: the tray executable is 3.2 MB and holds 31 MB working set, 6 MB of it private. An open window adds six WebView2 processes and 159 MB of private memory, and all six exit when it closes.

## Considered Options

- **Electron.** Rejected. Its main process is Node and could have run the daemon in-process, but the daemon has to run without a desktop anyway, so the app talks to a separate process either way. What is left is a bundled Chromium kept resident for a tray.
- **A native app per platform (SwiftUI, C#, and something for Linux).** Rejected. Three interfaces for two people, and the Linux desktop had no owner.
- **Create the tray from Tauri's JavaScript API.** Rejected. That tray belongs to the webview, which closing the window destroys.
- **The app starts the daemon as its child.** Rejected. A device without a desktop needs a login item anyway, so this would be a second way to start the daemon. Quitting or crashing the app would take the device offline and end its open sessions, nothing would restart a daemon that crashed, and a child started by the app beside one started by the system would give one relay two connections from the same device.
- **Start the app's child now and move to a login item later.** Rejected. It ships one ownership model only to migrate the daemons it started to the other.
- **Edit configurations from the relay dashboard.** Rejected, for the reason above.
- **A tray menu only, with editing left to the CLI.** Rejected. Editing configurations in the app is part of the first version.

## Consequences

- Without an Apple Developer ID signature and notarization, Gatekeeper blocks the downloaded app, and Homebrew's official casks disabled apps that fail Gatekeeper on 2026-09-01. Until there is an account, the macOS app is for testers. The executable from ADR 0017 needs only an ad-hoc signature when installed by `install.sh` or a formula.
- Windows shows a SmartScreen warning for an unsigned installer.
- GNOME without the AppIndicator extension shows no tray. When no tray is available, the app opens its window instead.
- A Windows logon task that starts a console program opens a console window. The daemon started by the system has to run without one.
- launchd and systemd user units start the daemon with a minimal `PATH`, as macOS does for an app opened from Finder, so `npx` and agent commands are not found unless the daemon learns the person's `PATH`.
