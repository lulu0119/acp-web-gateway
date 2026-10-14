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

   `login` prints a link with the code filled in. Approve that code on Exterior after signing in with GitHub. `daemon` keeps an outbound connection.

   `exterior --help` and `exterior <command> --help` describe each command. `agent-config types` prints the ids in the [ACP Registry](https://agentclientprotocol.com/get-started/registry). `create --agent-type` uses one of those ids. An `npx` or `uvx` entry is started with that tool. A binary entry runs only when its command is already on `PATH`. An agent that is not in the registry is added with `--command`. Add another configuration with `--name`, and repeat `--env KEY=VALUE` for that slot. `agent-config list` prints the names.

3. The web app redirects the person to Exterior. Exterior asks for consent, then sends them back. Example does this from **Sign in with Exterior**: there is nothing to configure, and the app receives its client id together with the approval. From a checkout, `pnpm example` starts Example. A web app adds the client with `pnpm add https://pkg.pr.new/lulu0119/exterior/@exterior/client@main`.

4. The web app lists the account's online devices and asks Exterior to open one agent. Exterior returns a one-time WebSocket address. The page uses that address as the ACP connection.

`login --relay <url>` signs the device in to an Exterior other than `http://127.0.0.1:8787`. A bare host such as `relay.example.com` means https. A device keeps one sign-in per relay in `~/.config/exterior/sign-ins/`, and can be signed in to several relays. `daemon` and `logout` act on the only sign-in, or on the one named with `--relay` or `EXTERIOR_RELAY`; with several and none named, they list the choices and stop. One daemon serves one relay, so serving two relays takes two daemons. `status` lists the sign-ins. Example reads `VITE_EXTERIOR_URL` at image build time for the same reason. A push to `main` publishes `exterior`, `@exterior/contract`, and `@exterior/client` from this repository. npm comes later, when the product is ready.

The daemon checks its saved credentials before each connection attempt and refreshes an access token within one minute of expiry. An established connection stays open; token expiry is handled when reconnecting. If the relay responds with HTTP 401, the daemon forces one refresh and tries again. Temporary connection or refresh failures retry with delays from one to thirty seconds. Rejected refresh credentials, a second 401 after refresh, or an HTTP 403 for a token issued to another client stop the daemon with instructions to sign in again.

## Decisions

- [Tokens are told apart by the client they were issued to](docs/adr/0014-tokens-are-told-apart-by-client.md)
- [A machine keeps one sign-in per relay](docs/adr/0013-one-sign-in-per-relay.md)
- [Relay pages share React UI](docs/adr/0012-relay-page-rendering.md)
- [An account relays a web app to a machine](docs/adr/0008-account-relay.md)
- [Coolify hosts Exterior](docs/adr/0010-coolify-hosts-exterior.md)
- [The daemon launches agents from the ACP Registry](docs/adr/0009-acp-registry-launch.md)
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
