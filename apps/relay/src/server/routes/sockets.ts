import { acpPath, daemonPath, parseDaemonMessage } from "@mukae/contract";
import type { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { BrowserLink, Registry } from "../connections/registry.js";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";

export function mountSockets(app: Hono<RelayEnv>, input: {
  registry: Registry;
  readAccess: ReadAccess;
  daemonClientId: string;
  upgradeWebSocket: ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];
}): void {
  app.get(
    daemonPath,
    accessAccount(input.readAccess, (clientId) => clientId === input.daemonClientId, "text"),
    input.upgradeWebSocket((c) => {
      const userId = c.get("userId");
      let connection: ReturnType<Registry["connectDaemon"]> | undefined;
      return {
        onOpen(_event, ws) {
          connection = input.registry.connectDaemon({
            userId,
            send(message) {
              ws.send(JSON.stringify(message));
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
      return {
        onOpen(_event, ws) {
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
          link?.close();
        },
      };
    }),
  );
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
// fresh ticket is worth opening. Old clients ignore the detail.
function ticketCloseReason(reason: "used" | "expired" | "gone"): string {
  if (reason === "used") return "ticket-used";
  if (reason === "expired") return "ticket-expired";
  return "ticket-gone";
}
