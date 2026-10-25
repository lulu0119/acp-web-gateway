import { randomBytes, randomUUID } from "node:crypto";
import { parseJson, parseMcpFrame, type McpFrame, type McpSocketCloseReason } from "@exterioragentprotocol/sdk";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ErrorCode, isJSONRPCErrorResponse, isJSONRPCRequest, isJSONRPCResultResponse, type JSONRPCMessage, type RequestId } from "@modelcontextprotocol/sdk/types.js";

const ticketTtlMs = 60_000;

/** The page's socket for one endpoint. */
export type McpSocket = { send(frame: string): void; close(reason: McpSocketCloseReason | "invalid_message"): void };
/** What the socket's handler tells the endpoints. */
export type McpSocketLink = { frame(frame: string): void; closed(): void };

/** `pending`: the agent's requests the page has not answered. */
type Session = { transport: WebStandardStreamableHTTPServerTransport; pending: Set<RequestId> };

type Endpoint = {
  userId: string;
  clientId: string;
  ticket: string;
  token: string;
  socket?: McpSocket;
  /** One Streamable HTTP transport per MCP session, by `Mcp-Session-Id`. */
  sessions: Map<string, Session>;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * MCP endpoints that web apps serve from their pages. The relay speaks MCP's Streamable HTTP to the agent and passes
 * each session's JSON-RPC messages to the page over its socket, never reading what a tool is asked or answers. An
 * endpoint lives as long as that socket.
 */
export type McpEndpoints = {
  /** A client opened an endpoint. The page dials `ticket` to serve it; an agent sends `token` as its bearer token. */
  open(input: { userId: string; clientId: string }): { ticket: string; token: string };
  /** A page dialed a ticket. Dialing consumes it; undefined when it is used, expired or unknown. */
  acceptSocket(ticket: string, socket: McpSocket): McpSocketLink | undefined;
  /** An agent's MCP request. Answered 404 unless `token` names an endpoint whose page is connected. */
  handle(token: string, request: Request): Promise<Response>;
  /** The account revoked the client: its endpoints close with `revoked`. */
  revokeClient(input: { userId: string; clientId: string }): void;
};

export function createMcpEndpoints(): McpEndpoints {
  const byTicket = new Map<string, Endpoint>();
  const byToken = new Map<string, Endpoint>();

  function drop(endpoint: Endpoint): void {
    clearTimeout(endpoint.timer);
    byTicket.delete(endpoint.ticket);
    byToken.delete(endpoint.token);
    endpoint.socket = undefined;
    const sessions = [...endpoint.sessions.values()];
    endpoint.sessions.clear();
    // A call the page can no longer answer fails now, rather than leaving the agent waiting on a closed stream.
    for (const { transport, pending } of sessions) {
      void Promise.all([...pending].map((id) => transport.send({ jsonrpc: "2.0", id, error: { code: ErrorCode.ConnectionClosed, message: "The page serving these tools closed." } }).catch(() => undefined)))
        .then(() => transport.close());
    }
  }

  function send(endpoint: Endpoint, frame: McpFrame): void {
    endpoint.socket?.send(JSON.stringify(frame));
  }

  function startSession(endpoint: Endpoint): WebStandardStreamableHTTPServerTransport {
    const pending = new Set<RequestId>();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (session) => {
        endpoint.sessions.set(session, { transport, pending });
      },
    });
    transport.onmessage = (message) => {
      if (!transport.sessionId) return;
      if (isJSONRPCRequest(message)) pending.add(message.id);
      send(endpoint, { session: transport.sessionId, message });
    };
    transport.onclose = () => {
      const session = transport.sessionId;
      if (!session || !endpoint.sessions.delete(session)) return;
      send(endpoint, { session, closed: true });
    };
    return transport;
  }

  return {
    open({ userId, clientId }) {
      const endpoint: Endpoint = {
        userId,
        clientId,
        ticket: randomBytes(32).toString("base64url"),
        token: randomBytes(32).toString("base64url"),
        sessions: new Map(),
        timer: setTimeout(() => drop(endpoint), ticketTtlMs),
      };
      byTicket.set(endpoint.ticket, endpoint);
      return { ticket: endpoint.ticket, token: endpoint.token };
    },

    acceptSocket(ticket, socket) {
      const endpoint = byTicket.get(ticket);
      if (!endpoint) return undefined;
      byTicket.delete(ticket);
      clearTimeout(endpoint.timer);
      endpoint.socket = socket;
      byToken.set(endpoint.token, endpoint);
      return {
        frame(text) {
          const frame = parseMcpFrame(parseJson(text));
          if (!frame || "closed" in frame) {
            socket.close("invalid_message");
            return;
          }
          const session = endpoint.sessions.get(frame.session);
          const message = frame.message as JSONRPCMessage;
          if ((isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) && message.id !== undefined) session?.pending.delete(message.id);
          const options = frame.relatedRequestId === undefined ? undefined : { relatedRequestId: frame.relatedRequestId };
          // The agent's request may be gone, cancelled or its session ended, by the time the page answers.
          session?.transport.send(message, options).catch(() => undefined);
        },
        closed() {
          drop(endpoint);
        },
      };
    },

    async handle(token, request) {
      const endpoint = byToken.get(token);
      if (!endpoint?.socket) return notFound();
      const session = request.headers.get("mcp-session-id");
      if (!session) return startSession(endpoint).handleRequest(request);
      return endpoint.sessions.get(session)?.transport.handleRequest(request) ?? notFound();
    },

    revokeClient({ userId, clientId }) {
      for (const endpoint of new Set([...byTicket.values(), ...byToken.values()])) {
        if (endpoint.userId !== userId || endpoint.clientId !== clientId) continue;
        endpoint.socket?.close("revoked");
        drop(endpoint);
      }
    },
  };
}

function notFound(): Response {
  return Response.json({ code: "target_not_found", message: "No MCP endpoint is served here. The page that served it may have closed." }, { status: 404 });
}
