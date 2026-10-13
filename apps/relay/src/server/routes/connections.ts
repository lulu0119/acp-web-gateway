import { acpPath, devicesPath, machinesPath, parseDeviceRegistration, sessionsPath } from "@exterior/contract";
import type { Hono } from "hono";
import type { Registry } from "../connections/registry.js";
import type { DeviceStore } from "../devices/store.js";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";

export function mountConnections(app: Hono<RelayEnv>, input: {
  registry: Registry;
  devices: DeviceStore;
  readAccess: ReadAccess;
  daemonClientId: string;
  publicUrl: string;
}): void {
  const webApps = accessAccount(input.readAccess, (clientId) => clientId !== input.daemonClientId);
  const daemon = accessAccount(input.readAccess, (clientId) => clientId === input.daemonClientId);

  app.get(machinesPath, webApps, (c) => c.json({
    machines: input.registry.listMachines(c.get("userId")).map(({ id, hostname, agents }) => ({ id, hostname, agents })),
  }));
  app.post(sessionsPath, webApps, async (c) => {
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
  });
  app.post(devicesPath, daemon, async (c) => {
    const registration = parseDeviceRegistration(await c.req.json().catch(() => undefined));
    if (!registration) return c.json({ message: "Send a device id and a hostname." }, 400);
    if (!input.devices.record({ userId: c.get("userId"), ...registration })) {
      return c.json({ message: "That device id belongs to another account." }, 409);
    }
    return c.json({ recorded: true });
  });
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
