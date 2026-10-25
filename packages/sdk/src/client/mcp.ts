import { closeReason, mcpEndpointsPath, mcpSocketCloseCodes, parseJson, parseMcpFrame, type McpFrame, type McpSocketCloseReason } from "../index.js";
import { isRecord, originOf } from "../oauth.js";
import { relayError, RelayError } from "./oauth.js";

/**
 * One MCP session on the page, shaped as the MCP SDK's `Transport`: pass it to `McpServer.connect`. Messages that
 * arrive before `start` wait for it.
 */
export type McpTransport = {
  sessionId: string;
  start(): Promise<void>;
  send(message: object, options?: { relatedRequestId?: string | number }): Promise<void>;
  close(): Promise<void>;
  onmessage?: (message: object) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
};

/**
 * An MCP endpoint the page serves. Give an agent `url` and `headers` as an HTTP MCP server, such as an ACP
 * `mcpServers` entry of type `http`. It lives until `close` or until the socket closes; `closed` names the
 * relay's reason, or undefined for any other close.
 */
export type ServedMcp = {
  url: string;
  headers: { name: string; value: string }[];
  closed: Promise<McpSocketCloseReason | undefined>;
  close(): void;
};

/**
 * Opens an MCP endpoint on the relay and serves it from this page. `connect` is called once for each MCP session an
 * agent starts, with that session's transport; connect a new MCP server to it.
 */
export async function serveMcp(
  relayUrl: string,
  accessToken: string,
  connect: (transport: McpTransport) => void,
  signal?: AbortSignal,
): Promise<ServedMcp> {
  const response = await fetch(new URL(mcpEndpointsPath, originOf(relayUrl)), {
    method: "POST",
    credentials: "omit",
    headers: { authorization: `Bearer ${accessToken}` },
    signal,
  });
  const body = parseJson(await response.text());
  if (!response.ok) throw relayError(response.status, body, "The relay did not open the MCP endpoint.");
  if (!isRecord(body) || typeof body.url !== "string" || typeof body.mcpUrl !== "string" || typeof body.token !== "string") {
    throw new RelayError("server_error", response.status, "The relay did not open the MCP endpoint.");
  }

  const socket = new WebSocket(body.url);
  const sessions = new Map<string, ReturnType<typeof createTransport>>();
  const closed = new Promise<McpSocketCloseReason | undefined>((resolve) => {
    socket.addEventListener("close", (event) => {
      for (const session of sessions.values()) session.end();
      sessions.clear();
      resolve(closeReason(mcpSocketCloseCodes, event.code));
    });
  });
  socket.addEventListener("message", (event) => {
    const frame = typeof event.data === "string" ? parseMcpFrame(parseJson(event.data)) : undefined;
    if (!frame) return;
    if ("closed" in frame) {
      sessions.get(frame.session)?.end();
      sessions.delete(frame.session);
      return;
    }
    let session = sessions.get(frame.session);
    if (!session) {
      session = createTransport(frame.session, (sent) => socket.send(JSON.stringify(sent)));
      sessions.set(frame.session, session);
      connect(session.transport);
    }
    session.receive(frame.message);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    void closed.then(() => reject(new Error("The relay closed the MCP socket.")));
  });
  return {
    url: body.mcpUrl,
    headers: [{ name: "Authorization", value: `Bearer ${body.token}` }],
    closed,
    close: () => socket.close(1000),
  };
}

function createTransport(sessionId: string, send: (frame: McpFrame) => void) {
  let started = false;
  let ended = false;
  const waiting: object[] = [];
  const transport: McpTransport = {
    sessionId,
    async start() {
      started = true;
      for (const message of waiting.splice(0)) transport.onmessage?.(message);
    },
    async send(message, options) {
      if (ended) throw new Error("The MCP session ended.");
      send({ session: sessionId, message, ...(options?.relatedRequestId === undefined ? {} : { relatedRequestId: options.relatedRequestId }) });
    },
    // Stops this session on the page only. The relay ends a session when the agent does, or when the endpoint closes.
    async close() {
      end();
    },
  };
  function end(): void {
    if (ended) return;
    ended = true;
    transport.onclose?.();
  }
  return {
    transport,
    receive(message: object) {
      if (ended) return;
      if (started) transport.onmessage?.(message);
      else waiting.push(message);
    },
    end,
  };
}
