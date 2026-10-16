# The working directory is chosen, not typed

Status: accepted. Amends [0016](0016-resolve-commands-and-device-working-directory.md), which gave the device one fixed directory and deferred the choice.

ADR 0016 gave every device one working directory, `~/.local/share/exterior/workspace`, because a web app runs on another computer and cannot name one here. That directory is a placeholder for "somewhere safe", and it is a bad place to work: it is inside the data directory, it is the same on every device, and no person would have picked it. This decides where a session actually works.

## The decision

The directory is a setting in `~/.config/exterior/config.json`, under `workingDirectory`. It is absolute, and unset means the default path above. `exterior config set --working-directory <path>` writes it; `exterior config set --default` removes the key. The daemon reads it at startup, watches the file, and opens later sessions in a changed directory. Sessions already open keep the one they started in, because a process's cwd does not move.

The daemon reports the chosen directory in `hello` exactly as it reported the fixed one, so nothing in the contract, the relay, or a web app changes.

**A directory is selected, never typed.** The desktop app's window has no text field: it opens the system's own folder picker through `tauri-plugin-dialog` and writes what it chose with `exterior config set --working-directory <path>`. The CLI keeps `--working-directory <path>` for a machine with no desktop, and that is the only place a path is typed.

## Why

- **A chosen directory arrives already valid.** A picker hands back one that exists and is absolute, so there is no `~` to expand, no relative form to resolve, and nothing to pre-validate. The only path-shape rules left in the code are the ones for typed paths, and they are in one function.
- **Validation is `mkdir`, called once.** A path is refused where the person set it, in the words the system used (`EACCES`, `ENOTDIR`, `EPERM`), rather than guessed at beforehand. The daemon also calls it, so a directory deleted while the daemon runs is remade without a restart.
- **The configuration file is where a device's own settings already live.** The daemon watches it, the desktop app writes it through the CLI, and a second source — a daemon flag, or a file of the app's own — would let the window's setting and the daemon's setting disagree silently.
- **Choosing reaches the running daemon.** The watch already reports a changed configuration; a directory rides on the same event. No restart, and no second mechanism.

## Considered Options

- **A `--working-directory` flag on `exterior daemon`.** Rejected. The desktop app starts the daemons itself, so the value would have to live somewhere anyway, and someone running `exterior daemon` by hand would get a different directory than the window showed, without being told.
- **A settings file of the desktop app's own.** Rejected. Two writers of one fact, and the CLI would not see the choice.
- **A text field in the window, validated before writing.** Rejected. A person typing a path can be wrong in ways no check catches — the wrong directory, one that exists, spelled correctly.
- **`tauri-plugin-dialog`.** Chosen. It is the same pattern as the tray app's other plugins, and the dialog it shows is each system's own. A hand-rolled picker over PowerShell, `osascript`, and `zenity`/`kdialog` was rejected: three quoting rules and two fallback programs to maintain, for a dialog that is less native than the plugin's on every system.
- **A per-agent directory.** Still deferred, as in 0016. One directory per device, and `AgentSlot` can carry one when configurations need it.
- **A relative path meaning "relative to the default".** Rejected. A session's directory has to be right for the daemon process, whose cwd is not the person's.
