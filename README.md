# Mukae

A web app reaches an [Agent Client Protocol (ACP)](https://agentclientprotocol.com) agent on a computer the person owns.

Mukae is the account and the relay. The person signs in with GitHub. A machine runs a daemon that stays connected. The web app is a separate site: it sends the person to Mukae, comes back with its own access token, and opens one live agent session. Example in this repo is one such web app.

The daemon does not implement ACP. It forwards each WebSocket text frame as one JSON line on the agent’s stdin, and each stdout line as one WebSocket text frame. Tool permission requests are forwarded unchanged. The web app is the ACP client.

## Layout

pnpm workspace:

- `apps/relay` — Mukae. Better Auth, the machine list, and the ACP ticket.
- `packages/contract` — relay paths and the daemon messages
- `packages/gateway` — the `mukae` daemon and `agent-config`
- `packages/client` — sign-in and session open for a web app or the daemon
- `apps/example` — a page that signs in, lists machines, and opens an agent. Coolify builds this image and the relay image from their Dockerfiles.

Inside `apps/relay`, `src/main.ts` opens dependencies and starts the server. `src/server/app.ts` assembles the complete application; its explicit mounts lead to every route in `src/server/routes/`. Identity operations live in `src/server/identity/`, and the connection registry owns machine, connection, and ticket lifecycles in `src/server/connections/`.

All page markup and UI live in `src/web/`. Account forms render on the server and submit through ordinary HTTP forms; the dashboard runs in the browser. Both use the same UI modules, layout, and stylesheet. `src/shared/` holds the data passed between the relay and its own pages. The public daemon and web-app protocol stays in `packages/contract`.

For UI development, run `pnpm --filter @mukae/relay web` alongside the relay with `WEB_DEV_SERVER_URL=http://127.0.0.1:47102`, then open the relay at `http://127.0.0.1:8787`. It serves the account pages and loads the dashboard and shared CSS from Vite. Account markup changes require rebuilding and restarting the relay. Set the same `BETTER_AUTH_URL` for both processes when using a different relay origin. Production reads the asset manifest once when the application is assembled.

## Flow

1. Start Mukae with GitHub OAuth credentials. See `apps/relay/.env.example`. From the repo root, `pnpm relay` listens on `127.0.0.1:8787`.
2. On the machine that should run agents, install the preview CLI and sign it in:

   ```bash
   npx --package=https://pkg.pr.new/lulu0119/mukae@main -- mukae login
   npx --package=https://pkg.pr.new/lulu0119/mukae@main -- mukae agent-config create --agent-type opencode
   npx --package=https://pkg.pr.new/lulu0119/mukae@main -- mukae daemon
   ```

   `@main` is the latest preview published from `main`. Use a commit hash instead of `main` to stay on one publish. From a checkout, the same commands are `node packages/gateway/dist/cli.js`. `login` prints a link and a code. Approve that code on Mukae after signing in with GitHub. `daemon` keeps an outbound connection. Add another configuration with `--name`, and repeat `--env KEY=VALUE` for that slot. `agent-config list` prints the names. `agent-config types` prints the ids in the [ACP Registry](https://agentclientprotocol.com/get-started/registry). `create --agent-type` uses one of those ids. An `npx` or `uvx` entry is started with that tool. A binary entry runs only when its command is already on `PATH`. An agent that is not in the registry is added with `--command`.

3. The web app redirects the person to Mukae. Mukae asks for consent, then sends them back. Example does this from **Sign in with Mukae**: there is nothing to configure, and the app receives its client id together with the approval. A web app adds the client with `pnpm add https://pkg.pr.new/lulu0119/mukae/@mukae/client@main`.
4. The web app lists the account's online machines and asks Mukae to open one agent. Mukae returns a one-time WebSocket address. The page uses that address as the ACP connection.

`login --relay <url>` signs the machine in to a Mukae other than `http://127.0.0.1:8787`. A bare host such as `relay.example.com` means https. A machine keeps one sign-in per relay in `~/.config/mukae/sign-ins/`, and can be signed in to several relays. `daemon` and `logout` act on the only sign-in, or on the one named with `--relay` or `MUKAE_RELAY`; with several and none named, they list the choices and stop. One daemon serves one relay, so serving two relays takes two daemons. `status` lists the sign-ins. Example reads `VITE_MUKAE_URL` at image build time for the same reason. A push to `main` publishes `mukae`, `@mukae/contract`, and `@mukae/client` from this repository. npm comes later, when the product is ready.

The daemon checks its saved credentials before each connection attempt and refreshes an access token within one minute of expiry. An established connection stays open; token expiry is handled when reconnecting. If the relay responds with HTTP 401, the daemon forces one refresh and tries again. Temporary connection or refresh failures retry with delays from one to thirty seconds. Rejected refresh credentials or a second 401 after refresh stop the daemon with instructions to sign in again. Connection, refresh, and retry messages go to stderr with timestamps, without printing credentials.

## Scripts

```bash
pnpm install
pnpm build
pnpm test
pnpm relay
pnpm example
node packages/gateway/dist/cli.js login
node packages/gateway/dist/cli.js daemon
```

## Decisions

- [A machine keeps one sign-in per relay](docs/adr/0013-one-sign-in-per-relay.md)
- [Relay pages share React UI](docs/adr/0012-relay-page-rendering.md)
- [An account relays a web app to a machine](docs/adr/0008-account-relay.md)
- [Coolify hosts Mukae](docs/adr/0010-coolify-hosts-mukae.md)
- [The daemon launches agents from the ACP Registry](docs/adr/0009-acp-registry-launch.md)
- [ACP frames pass through](docs/adr/0002-passthrough-acp-frames.md)
- [Product name: Mukae](docs/adr/0004-product-name-mukae.md)

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
