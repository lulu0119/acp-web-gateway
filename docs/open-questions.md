# Open questions

- Build a small dedicated gateway, or adapt an MCP gateway such as agentgateway?
- Session model: per user, per workspace, or per browser tab?
- How does a browser authenticate a WebSocket (ticket exchange, subprotocol, cookie)?
- Where does the local agent connect out from (reverse tunnel) so users do not open inbound ports?
- Tool permission prompts: surfaced to the web UI, and who may approve?
- Audit: what is logged (metadata only, or tool inputs and outputs)?
- Multi-tenant isolation if one host serves several users.
