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
- `packages/react-hooks` — React hooks shared by the apps, such as `useCopyToClipboard`
- `apps/example` — a page that signs in, lists machines, and opens an agent. Coolify builds this image and the relay image from their Dockerfiles.

## Flow

1. Start Mukae with GitHub OAuth credentials. See `apps/relay/.env.example`. From the repo root, `pnpm relay` listens on `127.0.0.1:8787`.
2. On the machine that should run agents, install the preview CLI and sign it in:

   ```bash
   npx --package=https://pkg.pr.new/lulu0119/mukae@main -- mukae login
   npx --package=https://pkg.pr.new/lulu0119/mukae@main -- mukae agent-config create --agent-type opencode
   npx --package=https://pkg.pr.new/lulu0119/mukae@main -- mukae daemon
   ```

   `@main` is the latest preview published from `main`. Use a commit hash instead of `main` to stay on one publish. From a checkout, the same commands are `node packages/gateway/dist/cli.js`. `login` prints a link and a code. Approve that code on Mukae after signing in with GitHub. `daemon` keeps an outbound connection. Add another configuration with `--name`, and repeat `--env KEY=VALUE` for that slot. `agent-config list` prints the names. `agent-config types` prints the ids in the [ACP Registry](https://agentclientprotocol.com/get-started/registry). `create --agent-type` uses one of those ids. An `npx` or `uvx` entry is started with that tool. A binary entry runs only when its command is already on `PATH`. An agent that is not in the registry is added with `--command`.

3. The web app redirects the person to Mukae. Mukae asks for consent, then sends them back. Example does this from **Sign in with Mukae**: there is nothing to configure, and the app receives its client id together with the approval. A web app that keeps a secret on its backend registers once instead: sign into the dashboard, open **Authorized apps**, and register a confidential client with the app's callback address. Either way it adds the client with `pnpm add https://pkg.pr.new/lulu0119/mukae/@mukae/client@main`.
4. The web app lists the account's online machines and asks Mukae to open one agent. Mukae returns a one-time WebSocket address. The page uses that address as the ACP connection.

Pass `--relay` to `login` and `daemon` when Mukae is not `http://127.0.0.1:8787`. Example reads `VITE_MUKAE_URL` and its registered `VITE_MUKAE_CLIENT_ID` at image build time for the same reason. A push to `main` publishes `mukae`, `@mukae/contract`, and `@mukae/client` from this repository. npm comes later, when the product is ready.

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
