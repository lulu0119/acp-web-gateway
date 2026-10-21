import { acpPath, daemonCloseCodes, daemonPath, parseDaemonMessage, ticketCloseReasons } from "@exterioragentprotocol/sdk";
import { heartbeat, type BrowserLink, type Registry } from "@exterioragentprotocol/sdk/relay";
import type { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { WebSocket } from "ws";
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
          stopHeartbeat = pingSocket(ws.raw, heartbeatMs);
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
          stopHeartbeat = pingSocket(ws.raw, heartbeatMs);
          const taken = input.registry.takeTicket(ticket, {
            send(payload) {
              ws.send(payload);
            },
            close() {
              ws.close();
            },
          });
          if (!taken.ok) {
            ws.close(1008, ticketCloseReasons[taken.reason]);
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

// Ending a socket whose far end vanished ends the device's connection or the browser's session, which would otherwise linger.
function pingSocket(socket: WebSocket | undefined, everyMs: number): () => void {
  return socket ? heartbeat(socket, everyMs) : () => undefined;
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
