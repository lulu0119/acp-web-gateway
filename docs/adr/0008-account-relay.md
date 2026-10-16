# An account relays a web app to a machine

Status: accepted

Exterior is an account and a relay. A web app sends the person to Exterior to sign in, then calls back with its own access token. A machine runs `exterior daemon`, signs in with a device code, and keeps an outbound connection. Opening an agent returns a one-time WebSocket ticket because a browser socket cannot set `Authorization`.

Example is one web app. It does not share Exterior's login cookie. GitHub is how the person signs into Exterior. Consent on Exterior replaces the old browser prompt.

## Prior art

Transport and remote hubs this model was set against:

- [Lody](https://lody.ai/docs/quickstart/): a machine stays signed in, and the caller picks an agent on that machine.
- [acp-agent](https://github.com/OpenInsightDev/acp-agent): serves an agent over ACP HTTP/SSE and WebSocket.
- [zcode-acp-server remote clients guide](https://cdn.jsdelivr.net/npm/zcode-acp-server@0.63.0/docs/REMOTE-CLIENTS.md): hub with a shared bearer token (not per-user OAuth).
- [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication) and [elicitation](https://agentclientprotocol.com/protocol/v2/elicitation): agent-side auth, not web-user-to-agent gateway auth.

The local launch stack is gone: the custom scheme, the loopback listener, the certificate, and the installer that copied a binary into Application Support. ACP frames still pass through, as in [ADR 0002](0002-passthrough-acp-frames.md). The daemon starts the configured agent and forwards stdin and stdout.

## Considered Options

- **Keep the local click-to-launch path beside the relay.** Rejected. That path existed to start a process from a browser click, and it does not identify a person or a remote machine.
- **Give Example Exterior's session cookie.** Rejected. The web app is another origin. It is a public OAuth client.
- **Put the access token on the WebSocket URL.** Rejected. The URL would stay valid for the life of the token. The ticket is single-use and short-lived.
