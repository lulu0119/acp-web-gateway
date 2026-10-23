# Decisions

Every `adr/NNNN-slug.md` is listed here, newest first. Superseded entries stay for history. A new ADR adds its line in the same change.

- [0029 An assistant sets up a web app with one account approval](adr/0029-an-assistant-sets-up-a-web-app.md) — accepted. A coding assistant hands the person a prefilled registration link and polls the relay over HTTP for the public client id, and a person can use Register app on the dashboard instead; authenticated registration stays, polling allocates no state, and a hosted relay is the default. Amends 0028.
- [0028 A web app names itself, and nobody registers anonymously](adr/0028-a-web-app-names-itself.md) — accepted, amended by 0029. A web app uses its metadata document or a client an account registered; no anonymous registration endpoint. A development copy signs in under the published document through its loopback redirect, and the relay knows the project's own documents. Consent shows the origin an app returns to, with no Unverified mark. Supersedes 0021.
- [0027 EAP endpoints are fixed, versioned paths](adr/0027-endpoints-are-fixed-versioned-paths.md) — accepted. `/eap/v1/...` under the relay address, the authorization server from RFC 9728 metadata; no EAP metadata document and no version in `hello`.
- [0026 A device is a key its tokens are bound to](adr/0026-a-device-is-a-key.md) — accepted. Device software is one OAuth client named by a metadata document; each device is a DPoP key (RFC 9449) whose thumbprint is its id; roles are the `eap:client` and `eap:device` scopes; removal deletes the key's refresh tokens. Supersedes 0014 and 0020, amends 0019.
- [0025 Each connection has its own agent socket](adr/0025-each-connection-has-its-own-agent-socket.md) — accepted. The device socket carries only `hello`, `open` and `open_failed`; the device dials one agent socket per connection, joined to the attach socket with backpressure. Amends 0023.
- [0024 The protocol ships as one SDK](adr/0024-the-protocol-ships-as-one-sdk.md) — accepted. `@exterioragentprotocol/sdk` with an entry per role: `client`, `client/react`, `device`, `relay`, and the wire types at the root.
- [0023 A connection lasts as long as its socket](adr/0023-a-connection-lasts-as-long-as-its-socket.md) — accepted, amended by 0025. No detach, rings or resume; a client reconnects with a new connection and ACP `session/resume`. The dial consumes the ticket. Supersedes 0011.
- [0022 The working directory is chosen, not typed](adr/0022-the-working-directory-is-chosen.md) — accepted. A setting in `config.json` chosen in the system's folder picker; `mkdir` is the check. Amends 0016.
- [0021 A web app registers itself, or names itself by its own document](adr/0021-a-web-app-registers-itself.md) — superseded by 0028.
- [0020 Removing a device deletes the daemon tokens stamped with its id](adr/0020-removing-a-device-deletes-its-tokens.md) — superseded by 0026.
- [0019 A device keeps its id through signing out, and is online once](adr/0019-a-device-keeps-its-id-and-one-connection.md) — accepted, amended by 0026. One id per relay survives sign-out; the newest connection wins and both sides heartbeat.
- [0018 The desktop app is a Tauri tray that runs the daemon](adr/0018-the-desktop-app-is-a-tauri-tray.md) — accepted. The tray owns one `exterior daemon` child per sign-in and talks to it only through JSON commands.
- [0017 The daemon ships as one executable](adr/0017-the-daemon-ships-as-one-executable.md) — accepted. One file per platform via `node --build-sea`; install.sh, Homebrew, Scoop, and winget point at GitHub Releases.
- [0016 A command resolves to one file, and a device has its own working directory](adr/0016-resolve-commands-and-device-working-directory.md) — accepted. Resolve once; `.cmd`/`.bat` go through cmd.exe with dangerous arguments refused; stopping ends the whole process tree.
- [0015 Product name: Exterior](adr/0015-product-name-exterior.md) — accepted. The total rename; supersedes 0004.
- [0014 Tokens are told apart by the client they were issued to](adr/0014-tokens-are-told-apart-by-client.md) — superseded by 0026.
- [0013 A machine keeps one sign-in per relay](adr/0013-one-sign-in-per-relay.md) — accepted. One sign-in file per relay; no remembered "active" relay.
- [0012 Apps share React UI](adr/0012-relay-page-rendering.md) — accepted. Relay, Desktop, and Example share basic controls through `@exterior/ui`; app pages and chat components stay with their consumers.
- [0011 A ticket survives an infant socket, and the client owns the retry](adr/0011-ticket-retake-grace.md) — superseded by 0023.
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
