import {
  acpPath,
  daemonPath,
  machinesPath,
  parseDaemonMessage,
  publicClientsPath,
  sessionsPath,
  type PublicClients,
} from "@mukae/contract";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Registry } from "./registry.js";

export type RelayEnv = { Variables: { userId: string } };

export function createRelayApp(input: {
  registry: Registry;
  readUserId: (request: Request) => Promise<string | undefined>;
  clients: PublicClients;
  publicUrl: string;
}) {
  const app = new Hono<RelayEnv>();
  const sockets = createNodeWebSocket({ app });

  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );
  app.get(publicClientsPath, (c) => c.json(input.clients));
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get(
    machinesPath,
    async (c, next) => {
      const userId = await input.readUserId(c.req.raw);
      if (!userId) return c.json({ message: "Sign in again." }, 401);
      c.set("userId", userId);
      await next();
    },
    (c) => c.json({ machines: input.registry.listMachines(c.get("userId")) }),
  );
  app.post(
    sessionsPath,
    async (c, next) => {
      const userId = await input.readUserId(c.req.raw);
      if (!userId) return c.json({ message: "Sign in again." }, 401);
      c.set("userId", userId);
      await next();
    },
    async (c) => {
      const body: unknown = await c.req.json().catch(() => undefined);
      const machineId = recordString(body, "machineId");
      const agentName = recordString(body, "agentName");
      if (!machineId || !agentName) return c.json({ message: "Choose a machine and an agent." }, 400);
      const result = await input.registry.openSession({ userId: c.get("userId"), machineId, agentName });
      if (!result.ok) return c.json({ message: result.message }, result.status);
      return c.json({
        url: sessionSocketUrl(input.publicUrl, result.ticket),
        agentType: result.agentType,
        agentName: result.agentName,
      });
    },
  );
  app.get(
    daemonPath,
    async (c, next) => {
      const userId = await input.readUserId(c.req.raw);
      if (!userId) return c.text("Unauthorized", 401);
      c.set("userId", userId);
      await next();
    },
    sockets.upgradeWebSocket((c) => {
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
    sockets.upgradeWebSocket((c) => {
      const ticket = c.req.query("ticket") ?? "";
      let link: ReturnType<Registry["takeTicket"]>;
      return {
        onOpen(_event, ws) {
          link = input.registry.takeTicket(ticket, {
            send(payload) {
              ws.send(payload);
            },
            close() {
              ws.close();
            },
          });
          if (!link) ws.close(1008, "ticket");
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

  return { app, injectWebSocket: sockets.injectWebSocket };
}

function sessionSocketUrl(publicUrl: string, ticket: string): string {
  const socket = new URL(acpPath, publicUrl);
  socket.protocol = socket.protocol === "https:" ? "wss:" : "ws:";
  socket.search = "";
  socket.searchParams.set("ticket", ticket);
  return socket.toString();
}

function recordString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 && field.length <= 128 ? field : undefined;
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
