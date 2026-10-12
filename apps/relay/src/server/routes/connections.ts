import { acpPath, machinesPath, sessionsPath } from "@mukae/contract";
import type { Hono } from "hono";
import type { Registry } from "../connections/registry.js";
import { accessAccount, type RelayEnv, type ReadUserId } from "../http.js";

export function mountConnections(app: Hono<RelayEnv>, input: { registry: Registry; readUserId: ReadUserId; publicUrl: string }): void {
  app.get(
    machinesPath,
    accessAccount(input.readUserId),
    (c) => c.json({ machines: input.registry.listMachines(c.get("userId")) }),
  );
  app.post(
    sessionsPath,
    accessAccount(input.readUserId),
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
