# A command resolves to one file, and a device has its own working directory

Status: accepted

Agents failed to start or stop on Windows, and the fixes were growing a Windows check at every call site. The cause was one fact asked three times with three rules: the existence check walked `PATH` with `PATHEXT`, Node's spawn looked only for `.exe`, and cmd.exe searched again by its own rules. The daemon now resolves a command name once, to the file it will start. A `.exe` is started directly. A `.cmd` or `.bat` goes through cmd.exe, the only path that does, and an argument cmd.exe would read as syntax (`&`, `%`, `|`, quotes, and the like) is refused instead of escaped. A registry binary such as `./opencode.exe` names a file inside the archive, so the daemon looks up the name the person installed, `opencode`, which may be an `.exe` or the `.cmd` npm writes.

A stop closes the agent's stdin, then ends the whole process tree after two seconds: on Windows with `taskkill /t`, elsewhere by signalling the process group the agent was started in. A batch script, `npx`, and `uvx` all start the agent as their own child, so stopping only the direct child leaves the agent running.

A web app runs on another computer and cannot name a directory on the device. It used to send `/`, which on Windows is a drive root where agents do not answer, and on other systems is the filesystem root. The daemon now has one fixed working directory, `~/.local/share/exterior/workspace`, the same relative path on every system. Configuration and sign-ins stay in `~/.config/exterior`. The agent process starts in the working directory, so that directory is not a child of the one that holds credentials. The daemon reports it in `hello`, and the relay lists it with the machine. A web app sends it as the session cwd when the person has not chosen one. `workingDirectory` is required, in the daemon message and in the machine a web app lists: a web app has nothing safe to send without it. The gateway still forwards ACP frames unchanged ([ADR 0002](0002-passthrough-acp-frames.md)).

## Considered Options

- **Launch every agent through cmd.exe and kill the tree with `taskkill`.** Rejected. It let cmd.exe search `PATH` behind the existence check and gave cmd.exe every registry argument to parse.
- **Run `npx-cli.js` with this process's own Node, so `npx` never meets cmd.exe.** Rejected. Where that file lives depends on how Node was installed (nvm, Volta, fnm, the installer). A refused argument is easier to explain than a missing file.
- **A Windows Job object instead of `taskkill`.** Rejected. Node has no Job object API, and a native module is too much for one stop.
- **Rewrite a `/` cwd in `session/new` inside the daemon.** Rejected. It broke the passthrough rule, recognised the root by a fixed list of spellings, and only on Windows, so on other systems the agent still worked in `/`.
- **Report the directory on each agent slot instead of on the device.** Rejected for now. There is one directory per device. A per-agent directory can be added to `AgentSlot` when configurations need it.
- **Let a daemon that reports no directory stay connected.** Rejected. Nothing has shipped, and a device that reports none leaves a web app with only the placeholder that caused the problem.
- **Put the working directory in `~/.config/exterior`.** Rejected. The agent starts there, and that folder holds `config.json` and `sign-ins/`.
- **Use each system's native data directory.** Rejected. `~/Library/Application Support` and `%APPDATA%` are the desktop-app layout. This daemon uses one home-relative path on macOS, Linux, and Windows.
