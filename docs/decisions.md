# Decisions

Every `adr/NNNN-slug.md` is listed here, newest first. Superseded entries stay for history. A new ADR adds its line in the same change.

- [0022 The working directory is chosen, not typed](adr/0022-the-working-directory-is-chosen.md) — accepted. A setting in `config.json` chosen in the system's folder picker; `mkdir` is the check. Amends 0016.
- [0021 A web app registers itself, or names itself by its own document](adr/0021-a-web-app-registers-itself.md) — accepted. Web apps arrive via RFC 7591 self-registration or a CIMD metadata document; the relay only forces loopback consent and prunes stale registrations.
- [0020 Removing a device deletes the daemon tokens stamped with its id](adr/0020-removing-a-device-deletes-its-tokens.md) — accepted. Removal deletes stamped daemon tokens, the device, and closes its socket; signing in again binds new tokens to the same id.
- [0019 A device keeps its id through signing out, and is online once](adr/0019-a-device-keeps-its-id-and-one-connection.md) — accepted. One id per relay survives sign-out; the newest connection wins and both sides heartbeat.
- [0018 The desktop app is a Tauri tray that runs the daemon](adr/0018-the-desktop-app-is-a-tauri-tray.md) — accepted. The tray owns one `exterior daemon` child per sign-in and talks to it only through JSON commands.
- [0017 The daemon ships as one executable](adr/0017-the-daemon-ships-as-one-executable.md) — accepted. One file per platform via `node --build-sea`; install.sh, Homebrew, Scoop, and winget point at GitHub Releases.
- [0016 A command resolves to one file, and a device has its own working directory](adr/0016-resolve-commands-and-device-working-directory.md) — accepted. Resolve once; `.cmd`/`.bat` go through cmd.exe with dangerous arguments refused; stopping ends the whole process tree.
- [0015 Product name: Exterior](adr/0015-product-name-exterior.md) — accepted. The total rename; supersedes 0004.
- [0014 Tokens are told apart by the client they were issued to](adr/0014-tokens-are-told-apart-by-client.md) — accepted. The relay routes on `azp`: daemon tokens only open `/api/daemon`, web app tokens only list devices and open sessions. (Written as machine, today's device.)
- [0013 A machine keeps one sign-in per relay](adr/0013-one-sign-in-per-relay.md) — accepted. One sign-in file per relay; no remembered "active" relay.
- [0012 Relay pages share React UI](adr/0012-relay-page-rendering.md) — accepted. Account pages and dashboard share markup, UI modules, and CSS under `apps/relay/src/web`.
- [0011 A ticket survives an infant socket, and the client owns the retry](adr/0011-ticket-retake-grace.md) — accepted. A socket that dies before any ACP frame flows may retake its ticket; sessions are never resumed.
- [0010 Coolify hosts Exterior](adr/0010-coolify-hosts-exterior.md) — accepted. The relay and Example run from Dockerfiles on Coolify; npm waits for the product, pkg-pr-new previews meanwhile.
- [0009 The daemon launches agents from the ACP Registry](adr/0009-acp-registry-launch.md) — accepted. `npx`/`uvx` entries start with that tool; unlisted agents are custom commands.
- [0008 An account relays a web app to a machine](adr/0008-account-relay.md) — accepted. The account-and-relay model: GitHub sign-in, consent on Exterior, device-code daemon sign-in, one-time WebSocket tickets.
- [0007 One loopback port for every connection](adr/0007-one-loopback-port.md) — superseded by 0008.
- [0006 The local gateway speaks HTTPS](adr/0006-loopback-https.md) — superseded by 0008.
- [0005 npx installs a stable copy](adr/0005-npx-installs-a-stable-copy.md) — superseded by 0008.
- [0004 Product name: Mukae](adr/0004-product-name-mukae.md) — superseded by 0015.
- [0003 One gateway process per connection](adr/0003-one-gateway-process-per-connection.md) — superseded by 0007.
- [0002 The gateway forwards ACP frames](adr/0002-passthrough-acp-frames.md) — accepted. No filtering or rewriting; tool permission requests pass through unchanged.
- [0001 Local gateway uses a custom scheme](adr/0001-local-custom-scheme-gateway.md) — superseded by 0008.
