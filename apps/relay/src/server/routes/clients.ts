import { clientRegistryPath, grantsPath } from "@exterior/contract";
import type { Registry } from "@exterioragentprotocol/sdk/relay";
import type { Hono } from "hono";
import { readAccount } from "../identity/session.js";
import type { RelayEnv } from "../http.js";
import type { ExteriorAuth } from "../identity/auth.js";
import { parseClientRegistration, registerClient } from "../identity/clients.js";
import { listGrantedApps, revokeGrant } from "../identity/grants.js";

export function mountClients(app: Hono<RelayEnv>, exterior: ExteriorAuth, registry: Registry): void {
  app.post(clientRegistryPath, async (c) => {
    const account = await readAccount(c.req.raw, exterior);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    const parsed = parseClientRegistration(await c.req.json().catch(() => undefined));
    if (!parsed.ok) return c.json({ message: parsed.errors.join(" ") }, 400);
    try {
      const registered = await registerClient(exterior, account.userId, parsed.value);
      return c.json(registered, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exterior could not register the client.";
      return c.json({ message }, message.includes("at most") ? 429 : 502);
    }
  });

  app.get(grantsPath, async (c) => {
    const account = await readAccount(c.req.raw, exterior);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    return c.json({ apps: await listGrantedApps(exterior, account) });
  });

  app.post(`${grantsPath}/revoke`, async (c) => {
    const account = await readAccount(c.req.raw, exterior);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    const body: unknown = await c.req.json().catch(() => undefined);
    const clientId = typeof body === "object" && body !== null && "clientId" in body && typeof body.clientId === "string" ? body.clientId : "";
    if (!clientId) return c.json({ message: "Choose an app to revoke." }, 400);
    await revokeGrant(exterior, account, clientId);
    registry.revokeClient({ userId: account.userId, clientId });
    return c.json({ revoked: true });
  });
}
