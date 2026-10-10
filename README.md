# Mukae

A web page calls an agent down onto this computer.

A local gateway that lets a web app use an [Agent Client Protocol (ACP)](https://agentclientprotocol.com) agent on the same computer.

The gateway does not implement ACP. It forwards each WebSocket text frame as one JSON line on the agent’s stdin, and each stdout line as one WebSocket text frame. Capabilities are whatever the web app and the local agent negotiate.

## Layout

pnpm workspace:

- `packages/contract` — launch URL, default port, status values
- `packages/gateway` — local CLI, package name `mukae`
- `packages/client` — browser helper a web app calls from a click
- `packages/agent-setup` — the setup prompt and gateway CLI commands that `apps/explain` and `apps/example` share
- `packages/react-hooks` — React hooks shared by the apps, such as `useCopyToClipboard`
- `apps/explain` — public setup page at https://lulu0119.github.io/mukae/explain/. Shown when the local program does not become ready. It copies a setup prompt for a coding agent, which configures the installed agents itself. `@mukae/client` exports that address as `explainPageUrl`. Run it locally with `pnpm explain` (port 47101)
- `apps/example` — a page that connects to a local agent, then lists working directories and sessions per connection in a sidebar

There is no relay package yet.

## Local flow

1. Run `npx mukae`. That copies the gateway into `~/Library/Application Support/mukae`, writes `~/.config/mukae/config.json`, and, on macOS, registers a windowless handler for `mukae://`. The handler reads a pointer file, so it does not contain a path. The same command writes a configuration for each installed agent that completes an ACP handshake. If an agent lists a sign-in method, the command says so and still writes that configuration. From a checkout, `node packages/gateway/dist/cli.js` does the same install, and `node packages/gateway/dist/cli.js register` points the handler at that checkout instead of the copy.
2. `npx mukae` writes one configuration per agent type that answers. Add another with `npx mukae agent-config create --agent-type opencode`. The name defaults to the type. Pass `--name` to keep another configuration of the same type, and repeat `--env KEY=VALUE` for that slot. `npx mukae agent-config list` prints the names. The gateway starts these registry types:

   - `claude-acp` — `npx -y @agentclientprotocol/claude-agent-acp@0.89.1`
   - `codex-acp` — `npx -y @agentclientprotocol/codex-acp@2.2.2`
   - `gemini` — `npx -y @google/gemini-cli@0.63.0 --acp`
   - `opencode` — `opencode acp`
3. From a click handler, the web app calls `connectLocalGateway({ agentType, documentationUrl })`. The helper opens `mukae://connect` on the app’s own origin, so the browser dialog names that site and the registered program name, Mukae. The launch URL carries the agent type.
4. The person allows the browser prompt. Each connection gets its own CLI process. It listens on `127.0.0.1` at the port in the launch URL, one of `47321` to `47340`, and accepts one WebSocket whose nonce and `Origin` match the launch URL. One configuration of that type starts immediately. Several configurations open a macOS dialog that lists only those names. Status reports the phase: `choosing`, `waiting`, `unconfigured`, or `cancelled`. Cancelling the dialog refuses the socket and leaves the page in place.
5. If the local program never becomes ready, the helper navigates to `documentationUrl`. Pass `explainPageUrl` to open the published setup page. That page gives a coding agent the setup prompt, and lists the same commands to run by hand. A missing configuration stays on the current page. The person does not install anything before that page opens.

The browser draws the prompt. This repo cannot change its wording. Chrome on macOS usually shows no prompt when nothing handles `mukae://`; it logs a failure and leaves the page in place. The helper treats “status never became waiting” as that failure. While a name dialog is open, status stays `choosing` and the helper keeps waiting. The dialog ends after 5 minutes if it is still open, and that counts as a cancellation.

No third-party account is involved. A later remote relay would use an account to bind a person to a machine. Tool permission requests are forwarded unchanged; the web app is the ACP client that displays them.

## Scripts

```bash
pnpm install
pnpm build
pnpm test
node packages/gateway/dist/cli.js
node packages/gateway/dist/cli.js register
pnpm example
pnpm explain
```

## Decisions

- [Local custom-scheme gateway](docs/adr/0001-local-custom-scheme-gateway.md)
- [ACP frames pass through](docs/adr/0002-passthrough-acp-frames.md)
- [Product name: Mukae](docs/adr/0004-product-name-mukae.md)
- [npx installs a stable copy](docs/adr/0005-npx-installs-a-stable-copy.md)

Agent rules: [AGENTS.md](AGENTS.md). Roadmap: [docs/open-work.md](docs/open-work.md).

## Open questions

A later remote relay, following [Lody](https://lody.ai/docs/quickstart/), is still open: the CLI on that machine signs in and keeps an outbound connection, then the caller chooses a machine and an agent configuration.

- Whether that relay is another workspace package that shares `packages/contract`.
- What a relay should record. The local gateway records nothing about ACP payloads.
- How Windows and Linux register the same custom scheme, and how those systems ask which configuration name to use. The launcher and the name dialog implemented here are macOS.

## Prior art

ACP transport and remote hubs:

- [acp-agent](https://github.com/OpenInsightDev/acp-agent): serves an agent over ACP HTTP/SSE and WebSocket.
- [zcode-acp-server remote clients guide](https://cdn.jsdelivr.net/npm/zcode-acp-server@0.63.0/docs/REMOTE-CLIENTS.md): hub with a shared bearer token (not per-user OAuth).
- [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication) and [elicitation](https://agentclientprotocol.com/protocol/v2/elicitation): agent-side auth, not web-user-to-agent gateway auth.

MCP-side OAuth gateways:

- [agentgateway MCP auth](https://agentgateway.dev/docs/standalone/latest/configuration/security/mcp-authn/)
- [mcp-auth-gateway](https://github.com/nicknikolakakis/mcp-auth-gateway)
- [mcp-stdio serve](https://github.com/shigechika/mcp-stdio)
- [mcp-switch](https://github.com/asashiki/mcp-switch)
