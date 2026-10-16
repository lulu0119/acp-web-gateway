# The daemon ships as one executable

Status: accepted

`npx` runs a package; it does not install one. It caches a package by its address, so `@main` keeps the first copy it downloaded, and a login item or tray that points into the npx cache stops working when the cache is cleared, as [ADR 0005](0005-npx-installs-a-stable-copy.md) found. A daemon that starts at login needs a file that stays where it was put. The daemon now ships as one executable per platform, built with Node's single executable application support (`node --build-sea`) from the bundle tsdown already produces. GitHub Releases hosts the files, and `install.sh`, a Homebrew formula in our own tap, a Scoop bucket, and winget each point at them. The daemon stays TypeScript, so it keeps sharing `@exterior/contract` with the relay and the web client. npx stays the way to run a preview.

Measured on Windows on 2026-10-15: the file is 104 MB, 39 MB gzipped, and an idle connected daemon holds about 66 MB working set.

The build needs Node 26: `--build-sea` arrived in 25.5, an ES module entry in 25.7, and 25 is past end of life. The Node that builds must be the exact version that is embedded. macOS ships for Apple silicon only: Node does not support single executables on Intel Macs, where `--build-sea` output crashes at start, and pnpm and t3code dropped that target for the same reason. See `docs/research/2026-10-15-node-sea-release.md`.

## Considered Options

- **`bun build --compile`.** Rejected. The compiled daemon failed every relay handshake (`ws` reported "HTTP 101"), and it was larger (113 MB) and held more memory (142 MB working set).
- **Rewrite the daemon in Rust.** Deferred. The file would be a few megabytes and the daemon would hold less memory, but it is a rewrite, and the contract types would have to be generated from a schema instead of shared. Revisit if the daemon's memory is the complaint: with the desktop app's window closed, the daemon is most of what stays resident ([ADR 0018](0018-the-desktop-app-is-a-tauri-tray.md)).
- **Keep npx and require Node.** Rejected for the reasons above. Node itself is not the burden: about half of the ACP Registry agents start with `npx`, so most devices already have it.
