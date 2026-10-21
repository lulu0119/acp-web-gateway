import { acpPath, attachCloseCodes, daemonPath, deviceCloseCodes, frameBytes, parseDaemonMessage } from "@exterioragentprotocol/sdk";
import { heartbeat, type BrowserLink, type Registry } from "@exterioragentprotocol/sdk/relay";
import type { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { WebSocket } from "ws";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";

const defaultHeartbeatMs = 30_000;
/** Unsent bytes past which an attach socket is too slow for its device's other connections, and is closed. */
const maxUnsentBytes = 2 * frameBytes;

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
              ws.close(deviceCloseCodes[reason], reason);
            },
          });
        },
        onMessage(event, ws) {
          const read = typeof event.data === "string" ? parseDaemonMessage(parseJson(event.data)) : undefined;
          if (read?.ok === false && read.reason === "unknown") return;
          if (!read?.ok || !connection) {
            ws.close(deviceCloseCodes.invalid_message, "invalid_message");
            return;
          }
          connection.receive(read.message);
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
              if ((ws.raw?.bufferedAmount ?? 0) > maxUnsentBytes) ws.close(1013, "slow");
            },
            close(reason) {
              ws.close(attachCloseCodes[reason], reason);
            },
          });
          if (!taken.ok) {
            ws.close(attachCloseCodes.ticket_rejected, "ticket_rejected");
            return;
          }
          link = taken.link;
        },
        onMessage(event, ws) {
          if (typeof event.data !== "string") {
            ws.close(1003, "binary");
            return;
          }
          if (Buffer.byteLength(event.data) > frameBytes) {
            ws.close(1009, "frame");
            return;
          }
          link?.frame(event.data);
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
