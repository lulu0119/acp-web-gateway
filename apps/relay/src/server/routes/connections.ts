import { parseDeviceRegistration } from "@exterior/contract";
import { acpPath, connectionsPath, devicesPath } from "@exterioragentprotocol/sdk";
import type { Hono } from "hono";
import type { Registry } from "@exterioragentprotocol/sdk/relay";
import type { DeviceStore } from "../devices/store.js";
import type { ExteriorAuth } from "../identity/auth.js";
import { bindDeviceToken } from "../identity/device-tokens.js";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";

export function mountConnections(app: Hono<RelayEnv>, input: {
  exterior: ExteriorAuth;
  registry: Registry;
  devices: DeviceStore;
  readAccess: ReadAccess;
  daemonClientId: string;
  publicUrl: string;
}): void {
  const webApps = accessAccount(input.readAccess, (clientId) => clientId !== input.daemonClientId);
  const daemon = accessAccount(input.readAccess, (clientId) => clientId === input.daemonClientId);

  app.get(devicesPath, webApps, (c) => c.json({
    devices: input.registry.listDevices(c.get("userId")).map(({ id, hostname, workingDirectory, agents, platform }) => ({ id, hostname, workingDirectory, agents, platform })),
  }));
  app.post(connectionsPath, webApps, async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const deviceId = recordString(body, "deviceId");
    const agentName = recordString(body, "agentName");
    if (!deviceId || !agentName) return c.json({ message: "Choose a device and an agent." }, 400);
    const result = await input.registry.openSession({ userId: c.get("userId"), clientId: c.get("clientId"), deviceId, agentName });
    if (!result.ok) return c.json({ message: result.message }, result.status);
    return c.json({
      url: sessionSocketUrl(input.publicUrl, result.ticket),
      agentType: result.agentType,
      agentName: result.agentName,
    });
  });
  app.post(devicesPath, daemon, async (c) => {
    const registration = parseDeviceRegistration(await c.req.json().catch(() => undefined));
    if (!registration) return c.json({ message: "Send a device id, a hostname, and the refresh token." }, 400);
    const userId = c.get("userId");
    const { deviceId, hostname, refreshToken } = registration;
    const bound = await bindDeviceToken(input.exterior, { userId, clientId: input.daemonClientId, deviceId, refreshToken });
    if (!bound) return c.json({ message: "The relay no longer accepts this device's sign-in." }, 403);
    if (!input.devices.record({ userId, deviceId, hostname })) {
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
