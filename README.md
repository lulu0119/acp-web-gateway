# acp-web-gateway

Design notes for exposing a local [Agent Client Protocol (ACP)](https://agentclientprotocol.com) agent to web apps through an OAuth-protected gateway.

Status: design only. No implementation code yet.

## Problem

Web apps increasingly embed an agent. The agent often runs locally (user machine or dev box), speaks ACP over stdio, and holds powerful tools (files, shell, models). The web app needs to reach it over the network without exposing it unauthenticated.

## Idea

Put a thin gateway in front of the local agent:

- Web app signs the user in with an OIDC identity provider.
- Web app connects to the gateway with a bearer token.
- Gateway validates the token, applies policy, and relays an ACP session (HTTP/SSE or WebSocket) to the local agent.
- The local agent never listens on the public internet.

See [docs/architecture.md](docs/architecture.md), [docs/auth-flow.md](docs/auth-flow.md), [docs/prior-art.md](docs/prior-art.md), and [docs/open-questions.md](docs/open-questions.md).

## Non-goals

- Replacing ACP's own agent-side authentication or elicitation.
- Putting OAuth tokens inside the ACP session.
- Shipping a production gateway in this repo (for now).
