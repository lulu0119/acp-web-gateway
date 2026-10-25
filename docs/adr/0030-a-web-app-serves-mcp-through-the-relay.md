# A web app serves MCP tools through the relay

Status: accepted

A web app such as Playground runs its tools in the page: a `codemode` tool, a desktop, a store. The agent runs on the person's device, which cannot reach the page. Without help, every such app deploys its own backend to take MCP requests and forward them to its page.

The relay does that once for every app. A client opens an MCP endpoint with `POST /eap/v1/mcp-endpoints`, dials the returned MCP socket with a ticket, and gives the agent the endpoint as an ACP `mcpServers` entry of type `http`: the relay's `/eap/v1/mcp` address and an `Authorization: Bearer` header holding the endpoint's own token. The relay ends MCP's Streamable HTTP with the MCP SDK's transport, one per MCP session, and carries each session's JSON-RPC messages over the socket, tagged with the session. The page connects one MCP server per session through `serveMcp` in the SDK's `client` entry. The endpoint lasts as long as the socket. When the socket closes, the relay answers the calls the page had not answered, and the token is answered 404 from then on.

This is the stable ACP path: `mcpServers` with `http`, which OpenCode supports, checked against `mcpCapabilities.http`. ACP's draft MCP-over-ACP RFD carries client tools over the ACP connection itself and would need no relay change, but it targets MCP 2026-07-28 only and OpenCode does not support it. That RFD describes an HTTP adapter for agents without it, and the endpoint is that adapter, on the relay because the agent and the page are on different computers.

## Considered Options

- **The endpoint's secret in the URL.** Rejected. ACP's `http` entry always carries headers, OpenCode forwards them, and the RFD's adapter keeps its credential out of URLs. A wrong token is answered 404 rather than 401, so an MCP client does not look for an authorization server.
- **The page speaks Streamable HTTP, with the relay piping raw HTTP to it.** Rejected. Every app would implement the transport, which is what the relay is here to save.
- **The relay passes messages without reading them, as ADR 0002 does for ACP.** Not possible. Two MCP sessions use the same request ids, so the relay has to keep them apart by `Mcp-Session-Id`. It reads the JSON-RPC envelope to answer unanswered calls when the page goes. It never reads a tool's arguments or results.
- **An endpoint tied to an EAP connection.** Rejected. Pages already close both together, and an endpoint does not need a device.
- **Per-ACP-session isolation.** Not offered. ACP does not say how far a client's MCP servers reach, and OpenCode shares them across sessions in one working directory for the life of the agent process. A page that needs isolation opens a connection, and an endpoint, per session.

## Consequences

- The relay depends on `@modelcontextprotocol/sdk` and keeps this beside its routes, not in the SDK's `relay` entry.
- The MCP socket has its own close codes, 4300 `ticket_rejected` and 4301 `revoked`, and a 16 MiB frame, because a tool result may carry an image.
- When agents support MCP-over-ACP, a page can declare an `acp` server instead, and the endpoint remains for agents that do not.
