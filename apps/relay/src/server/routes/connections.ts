import { clientScope, connectionsPath, devicesPath } from "@exterioragentprotocol/sdk";
import type { Registry } from "@exterioragentprotocol/sdk/relay";
import type { Hono } from "hono";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";

/** Whether the account still grants the client its devices. A revoked client's access token lives on until it expires. */
export type IsGranted = (userId: string, clientId: string) => Promise<boolean>;

export function mountConnections(app: Hono<RelayEnv>, input: {
  registry: Registry;
  readAccess: ReadAccess;
  resourceMetadataUrl: string;
  isGranted: IsGranted;
  publicUrl: string;
}): void {
  const client = accessAccount(input, clientScope);

  app.get(devicesPath, client, async (c) => {
    if (!(await input.isGranted(c.get("userId"), c.get("clientId")))) return c.json({ devices: [] });
    return c.json({
      devices: input.registry.listDevices(c.get("userId")).map(({ id, hostname, workingDirectory, agents, platform }) => ({ id, hostname, workingDirectory, agents, platform })),
    });
  });
  app.post(connectionsPath, client, async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const deviceId = recordString(body, "deviceId");
    const agentName = recordString(body, "agentName");
    if (!deviceId || !agentName) return c.json({ code: "invalid_request", message: "Choose a device and an agent." }, 400);
    if (!(await input.isGranted(c.get("userId"), c.get("clientId")))) return c.json({ code: "target_not_found", message: "That device is not online, or does not offer that agent." }, 404);
    const result = await input.registry.openConnection({ userId: c.get("userId"), clientId: c.get("clientId"), deviceId, agentName });
    if (!result.ok) return c.json({ code: result.code, message: result.message }, result.status);
    return c.json({ url: attachUrl(input.publicUrl, result.ticket) }, 201);
  });
}

/** Where a client dials a ticket. */
export const attachPath = "/eap/v1/attach";

function attachUrl(publicUrl: string, ticket: string): string {
  const socket = new URL(attachPath, publicUrl);
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
