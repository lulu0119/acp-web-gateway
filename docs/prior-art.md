# Prior art

ACP transport and remote hubs:
- [acp-agent](https://github.com/OpenInsightDev/acp-agent): serves an agent over ACP HTTP/SSE and WebSocket.
- [zcode-acp-server remote clients guide](https://cdn.jsdelivr.net/npm/zcode-acp-server@0.63.0/docs/REMOTE-CLIENTS.md): hub with a shared bearer token (not per-user OAuth).
- [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication) and [elicitation](https://agentclientprotocol.com/protocol/v2/elicitation): agent-side auth, not web-user-to-agent gateway auth.

MCP-side OAuth gateways (closest mature analogs):
- [agentgateway MCP auth](https://agentgateway.dev/docs/standalone/latest/configuration/security/mcp-authn/)
- [mcp-auth-gateway](https://github.com/nicknikolakakis/mcp-auth-gateway)
- [mcp-stdio serve](https://github.com/shigechika/mcp-stdio)
- [mcp-switch](https://github.com/asashiki/mcp-switch)

Gap: no widely adopted ACP gateway with per-user OAuth, session isolation, and audit.
