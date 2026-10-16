# Exterior

A web app reaches an [Agent Client Protocol (ACP)](https://agentclientprotocol.com) agent on a computer the person owns.

Exterior is the account and the relay. The person signs in with GitHub. A device signs in with `exterior login`, shows on the dashboard, and runs a daemon that stays connected. A web app is a separate site: it sends the person to Exterior, comes back with its own access token, and opens one connection. Example in this repo is one such web app.

The web app is the ACP client. The daemon forwards each message to the agent and back. Tool permission requests pass through unchanged.

## Use

1. Start the relay with GitHub OAuth credentials (`apps/relay/.env.example`). From a checkout, `pnpm relay` listens on `127.0.0.1:8787`.
2. Sign in a device so it runs agents: [manual](docs/manual.md).
3. Connect a web app with `useAccount`: [`@exterior/client`](packages/client/README.md).
4. The app lists the account's online devices and opens one agent over a one-time WebSocket address it uses as the ACP connection.

Decisions: [docs/decisions.md](docs/decisions.md). Manual: [docs/manual.md](docs/manual.md). Roadmap: [docs/open-work.md](docs/open-work.md).

Agent rules: [AGENTS.md](AGENTS.md).
