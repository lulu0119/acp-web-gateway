import { authorizeRequestPath, clientRegistryPath, grantsPath } from "@mukae/contract";
import type { Hono } from "hono";
import { readAccount } from "../identity/session.js";
import type { RelayEnv } from "../http.js";
import type { MukaeAuth } from "../identity/auth.js";
import {
  requestClientApproval,
  parseClientRegistration,
  parsePendingClient,
  registerClient,
} from "../identity/clients.js";
import { listGrantedApps, revokeGrant } from "../identity/grants.js";

export function mountClients(app: Hono<RelayEnv>, mukae: MukaeAuth): void {
  app.post(clientRegistryPath, async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    const parsed = parseClientRegistration(await c.req.json().catch(() => undefined));
    if (!parsed.ok) return c.json({ message: parsed.errors.join(" ") }, 400);
    try {
      const registered = await registerClient(mukae, account.userId, parsed.value);
      return c.json(registered, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mukae could not register the client.";
      return c.json({ message }, message.includes("at most") ? 429 : 502);
    }
  });

  app.post(authorizeRequestPath, async (c) => {
    const parsed = parsePendingClient(await c.req.json().catch(() => undefined));
    if (!parsed.ok) return c.json({ message: parsed.errors.join(" ") }, 400);
    try {
      return c.json({ url: await requestClientApproval(mukae, parsed.value) });
    } catch {
      return c.json({ message: "Mukae could not start the approval." }, 502);
    }
  });

  app.get(grantsPath, async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    return c.json({ apps: await listGrantedApps(mukae, account) });
  });

  app.post(`${grantsPath}/revoke`, async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    const body: unknown = await c.req.json().catch(() => undefined);
    const clientId = typeof body === "object" && body !== null && "clientId" in body && typeof body.clientId === "string" ? body.clientId : "";
    if (!clientId) return c.json({ message: "Choose an app to revoke." }, 400);
    await revokeGrant(mukae, account, clientId);
    return c.json({ revoked: true });
  });
}
