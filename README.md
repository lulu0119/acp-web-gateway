# Exterior

A web app reaches an [Agent Client Protocol (ACP)](https://agentclientprotocol.com) agent on a computer the person owns.

Exterior is the account and the relay. The person signs in with GitHub. A device signs in with `exterior login`, shows on the dashboard, and runs a daemon that stays connected. A web app is a separate site: it sends the person to Exterior, comes back with its own access token, and opens one connection. Example in this repo is one such web app.

The web app is the ACP client. The daemon forwards each message to the agent and back. Tool permission requests pass through unchanged.

## Use

1. Start Exterior with GitHub OAuth credentials. See `apps/relay/.env.example`. From a checkout, `pnpm relay` listens on `127.0.0.1:8787`.

2. On the device that should run agents, install the preview CLI and sign it in:

   ```bash
   npx --package=https://pkg.pr.new/lulu0119/exterior@main -- exterior login
   npx --package=https://pkg.pr.new/lulu0119/exterior@main -- exterior agent-config create --agent-type opencode
   npx --package=https://pkg.pr.new/lulu0119/exterior@main -- exterior daemon
   ```

   `@main` is the latest preview published from `main`. npx caches a package by its address and keeps running the first `@main` it downloaded, so use a commit hash, such as `@0b26097`, to get a newer publish. The package is one bundled file with no dependencies. From a checkout, the same commands are `node packages/gateway/dist/bin/exterior.mjs`.

   `login` prints a link with the code filled in. Approve that code on Exterior after signing in with GitHub. `daemon` keeps an outbound connection. It starts agents in `~/.local/share/exterior/workspace` and reports that directory, so a web app has a real working directory on the device to send when the person has not chosen one.

   `exterior --help` and `exterior <command> --help` describe each command. `agent-config types` prints the ids in the [ACP Registry](https://agentclientprotocol.com/get-started/registry). `create --agent-type` uses one of those ids. An `npx` or `uvx` entry is started with that tool. A binary entry runs only when its command is already on `PATH`. An agent that is not in the registry is added with `--command`. Add another configuration with `--name`, and repeat `--env KEY=VALUE` for that slot. `agent-config list` prints the names. A running daemon picks up a changed configuration file and tells the relay; sessions already open keep their agent. A daemon with no configurations stays connected and offers none until one is added.

   On a desktop, the Exterior app does the same without a terminal. It sits in the tray, starts at login, and runs one daemon for each relay the device is signed in to, starting it again if it stops. Its window signs in to relays and adds or removes agents. Quitting the app stops the daemons, so the device goes offline. Download it from the [latest release](https://github.com/lulu0119/exterior/releases/latest); the relay's Add device offers the file for the computer it is opened on. The app is not signed yet, so macOS and Windows ask once before opening it. A tag `v<version>` matching `apps/desktop/src-tauri/tauri.conf.json` runs `.github/workflows/release.yml`, which builds the app and the `exterior` executable for macOS on Apple silicon, Windows and Linux on x64 and Arm, and attaches them to a draft release to publish. From a checkout, `pnpm --filter @exterior/desktop dev` builds the `exterior` executable it ships beside itself and starts the app; `bundle` instead of `dev` builds the installer. Both need Rust and Node 26.

   On a Linux server without a desktop, run the daemon under a systemd user unit, such as `~/.config/systemd/user/exterior.service`:

   ```ini
   [Unit]
   Description=Exterior daemon

   [Service]
   ExecStart=%h/.local/bin/exterior daemon --relay relay.example.com
   Restart=on-failure
   RestartSec=5
   # 3: the relay rejected the sign-in, so run exterior login again first.
   RestartPreventExitStatus=3

   [Install]
   WantedBy=default.target
   ```

   Then `systemctl --user enable --now exterior`. A user unit runs while you are logged in; `loginctl enable-linger` keeps it running without a login.

3. The web app redirects the person to Exterior. Exterior asks for consent, then sends them back. Example does this from **Sign in with Exterior**: there is nothing to configure, and the app receives its client id with the approval address. The relay keeps one client per redirect address, so an app on https that is already approved comes straight back; an app on `localhost` is asked every time. An app can send a name and an icon (a small PNG, JPEG, GIF, or WebP `data:` URI) to `useAccount`; the consent page and the dashboard show them beside the app's address. From a checkout, `pnpm example` starts Example. A web app adds the client with `pnpm add https://pkg.pr.new/lulu0119/exterior/@exterior/client@main`.

4. The web app lists the account's online devices and asks Exterior to open one agent. Exterior returns a one-time WebSocket address. The page uses that address as the ACP connection.

`login --relay <url>` signs the device in to an Exterior other than `http://127.0.0.1:8787`. A bare host such as `relay.example.com` means https. A device keeps one sign-in per relay in `~/.config/exterior/sign-ins/`, and can be signed in to several relays. Its id on each relay sits in `~/.config/exterior/devices/`. `logout` revokes the sign-in on the relay and keeps the id, so signing in again lists the same device. Removing the device on the dashboard signs it out too: its daemon stops and asks to sign in again. `daemon` and `logout` act on the only sign-in, or on the one named with `--relay` or `EXTERIOR_RELAY`; with several and none named, they list the choices and stop. One daemon serves one relay, so serving two relays takes two daemons. `status` lists the sign-ins and what each one's daemon last reported: connected, retrying, or stopped and why. A daemon writes that to `~/.local/state/exterior/daemons/`, and `status --json` prints it for the desktop app. Example reads `VITE_EXTERIOR_URL` at image build time for the same reason. A push to `main` also publishes Example at `https://lulu0119.github.io/exterior/`. That build reads the repository variable `VITE_EXTERIOR_URL`, or `https://relay.apps.superpowerlulu.win` when the variable is empty. The page keeps the address it was built with, so a new address takes another run of the Example preview workflow. The same push publishes `exterior`, `@exterior/contract`, and `@exterior/client` from this repository. npm comes later, when the product is ready.

The daemon checks its saved credentials before each connection attempt and refreshes an access token within one minute of expiry. An established connection stays open; token expiry is handled when reconnecting. If the relay responds with HTTP 401, the daemon forces one refresh and tries again. Temporary connection or refresh failures retry with delays from one to thirty seconds. Rejected refresh credentials, a second 401 after refresh, or an HTTP 403 for a token issued to another client stop the daemon with instructions to sign in again.

## Decisions

- [Removing a device deletes the daemon tokens stamped with its id](docs/adr/0020-removing-a-device-deletes-its-tokens.md)
- [A web app that names itself is one client per redirect address](docs/adr/0021-a-web-app-is-one-client-per-redirect.md)
- [A device keeps its id through signing out, and is online once](docs/adr/0019-a-device-keeps-its-id-and-one-connection.md)
- [The desktop app is a Tauri tray](docs/adr/0018-the-desktop-app-is-a-tauri-tray.md)
- [The daemon ships as one executable](docs/adr/0017-the-daemon-ships-as-one-executable.md)
- [Tokens are told apart by the client they were issued to](docs/adr/0014-tokens-are-told-apart-by-client.md)
- [A machine keeps one sign-in per relay](docs/adr/0013-one-sign-in-per-relay.md)
- [Relay pages share React UI](docs/adr/0012-relay-page-rendering.md)
- [An account relays a web app to a machine](docs/adr/0008-account-relay.md)
- [Coolify hosts Exterior](docs/adr/0010-coolify-hosts-exterior.md)
- [The daemon launches agents from the ACP Registry](docs/adr/0009-acp-registry-launch.md)
- [A command resolves to one file, and a device has its own working directory](docs/adr/0016-resolve-commands-and-device-working-directory.md)
- [ACP frames pass through](docs/adr/0002-passthrough-acp-frames.md)
- [Product name: Exterior](docs/adr/0015-product-name-exterior.md)

Agent rules: [AGENTS.md](AGENTS.md). Roadmap: [docs/open-work.md](docs/open-work.md).

## Prior art

ACP transport and remote hubs:

- [Lody](https://lody.ai/docs/quickstart/): a machine stays signed in, and the caller picks an agent on that machine.
- [acp-agent](https://github.com/OpenInsightDev/acp-agent): serves an agent over ACP HTTP/SSE and WebSocket.
- [zcode-acp-server remote clients guide](https://cdn.jsdelivr.net/npm/zcode-acp-server@0.63.0/docs/REMOTE-CLIENTS.md): hub with a shared bearer token (not per-user OAuth).
- [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication) and [elicitation](https://agentclientprotocol.com/protocol/v2/elicitation): agent-side auth, not web-user-to-agent gateway auth.

MCP-side OAuth gateways:

- [agentgateway MCP auth](https://agentgateway.dev/docs/standalone/latest/configuration/security/mcp-authn/)
- [mcp-auth-gateway](https://github.com/nicknikolakakis/mcp-auth-gateway)
- [mcp-stdio serve](https://github.com/shigechika/mcp-stdio)
- [mcp-switch](https://github.com/asashiki/mcp-switch)
