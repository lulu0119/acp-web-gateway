import { acpPath, daemonCloseCodes, daemonPath, parseDaemonMessage } from "@exterior/contract";
import type { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { WebSocket } from "ws";
import type { BrowserLink, Registry } from "../connections/registry.js";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";

const defaultHeartbeatMs = 30_000;

export function mountSockets(app: Hono<RelayEnv>, input: {
  registry: Registry;
  readAccess: ReadAccess;
  daemonClientId: string;
  upgradeWebSocket: ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];
  /** How often the relay pings each socket. One still unanswered at the next ping is ended. */
  heartbeatMs?: number;
}): void {
  const heartbeatMs = input.heartbeatMs ?? defaultHeartbeatMs;
  app.get(
    daemonPath,
    accessAccount(input.readAccess, (clientId) => clientId === input.daemonClientId, "text"),
    input.upgradeWebSocket((c) => {
      const userId = c.get("userId");
      let connection: ReturnType<Registry["connectDaemon"]> | undefined;
      let stopHeartbeat: (() => void) | undefined;
      return {
        onOpen(_event, ws) {
          stopHeartbeat = heartbeat(ws.raw, heartbeatMs);
          connection = input.registry.connectDaemon({
            userId,
            send(message) {
              ws.send(JSON.stringify(message));
            },
            close(reason) {
              ws.close(daemonCloseCodes[reason], reason);
            },
          });
        },
        onMessage(event, ws) {
          const text = eventText(event.data);
          const message = text ? parseDaemonMessage(parseJson(text)) : undefined;
          if (!message || !connection) {
            ws.close(1008, "message");
            return;
          }
          connection.receive(message);
        },
        onClose() {
          stopHeartbeat?.();
          connection?.close();
        },
      };
    }),
  );
  app.get(
    acpPath,
    input.upgradeWebSocket((c) => {
      const ticket = c.req.query("ticket") ?? "";
      let link: BrowserLink | undefined;
      let stopHeartbeat: (() => void) | undefined;
      return {
        onOpen(_event, ws) {
          stopHeartbeat = heartbeat(ws.raw, heartbeatMs);
          const taken = input.registry.takeTicket(ticket, {
            send(payload) {
              ws.send(payload);
            },
            close() {
              ws.close();
            },
          });
          if (!taken.ok) {
            ws.close(1008, ticketCloseReason(taken.reason));
            return;
          }
          link = taken.link;
        },
        onMessage(event, ws) {
          const text = eventText(event.data);
          if (!text || !link) {
            ws.close(1008, "message");
            return;
          }
          link.frame(text);
        },
        onClose() {
          stopHeartbeat?.();
          link?.close();
        },
      };
    }),
  );
}

// A socket whose far end vanished without closing stays open until a ping goes unanswered.
// Ending it ends the device's connection or the browser's session, which would otherwise linger.
function heartbeat(socket: WebSocket | undefined, everyMs: number): () => void {
  if (!socket) return () => undefined;
  let answered = true;
  socket.on("pong", () => (answered = true));
  const timer = setInterval(() => {
    if (!answered) {
      socket.terminate();
      return;
    }
    answered = false;
    socket.ping();
  }, everyMs);
  return () => clearInterval(timer);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function eventText(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return undefined;
}

// Wire contract with web apps: the close reason tells the client whether a
// fresh ticket is worth opening.
function ticketCloseReason(reason: "used" | "expired" | "gone"): string {
  if (reason === "used") return "ticket-used";
  if (reason === "expired") return "ticket-expired";
  return "ticket-gone";
}
