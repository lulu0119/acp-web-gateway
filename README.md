# Exterior

A web app reaches an [Agent Client Protocol (ACP)](https://agentclientprotocol.com) agent on a computer the person owns.

Exterior is the account and the relay. The person signs in with GitHub. A device signs in with `exterior login`, shows on the dashboard, and runs a daemon that stays connected. A web app is a separate site: it sends the person to Exterior, comes back with its own access token, and opens one connection. Example in this repo is one such web app.

The web app is the ACP client. The daemon forwards each message to the agent and back. Tool permission requests pass through unchanged.

## Use

1. Use the hosted relay at `https://relay.apps.superpowerlulu.win`, or choose one you already use. App developers do not need to run a relay.
2. Have your coding assistant follow [app setup](docs/app-setup.md). The assistant gives you a link, you approve the app on the relay, and the assistant picks up its public app id over HTTP. To do it by hand, use Register app on the dashboard. An app with a published metadata identity can reuse that instead.
3. Sign in a device on the same relay so it runs agents: [manual](docs/manual.md). Connect the web app with [`@exterioragentprotocol/sdk`](packages/sdk/README.md).
4. The app lists the account's online devices and opens one agent over a one-time WebSocket address it uses as the ACP connection.

Decisions: [docs/decisions.md](docs/decisions.md). Manual: [docs/manual.md](docs/manual.md). Roadmap: [docs/open-work.md](docs/open-work.md).

To start an assistant, copy: “Connect this project to Exterior. Read https://raw.githubusercontent.com/lulu0119/exterior/main/docs/app-setup.md and follow the matching setup flow.”

Agent rules: [AGENTS.md](AGENTS.md).
