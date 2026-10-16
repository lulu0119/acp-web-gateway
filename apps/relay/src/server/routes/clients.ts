import { authorizeRequestPath, clientRegistryPath, grantsPath } from "@exterior/contract";
import type { Hono } from "hono";
import { readAccount } from "../identity/session.js";
import type { RelayEnv } from "../http.js";
import type { ExteriorAuth } from "../identity/auth.js";
import {
  requestClientApproval,
  parseClientRegistration,
  parsePendingClient,
  registerClient,
} from "../identity/clients.js";
import { findClientIcon, listGrantedApps, revokeGrant } from "../identity/grants.js";

export function mountClients(app: Hono<RelayEnv>, exterior: ExteriorAuth): void {
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

  app.post(authorizeRequestPath, async (c) => {
    const parsed = parsePendingClient(await c.req.json().catch(() => undefined));
    if (!parsed.ok) return c.json({ message: parsed.errors.join(" ") }, 400);
    try {
      return c.json({ url: await requestClientApproval(exterior, parsed.value) });
    } catch {
      return c.json({ message: "Exterior could not start the approval." }, 502);
    }
  });

  // Served from the relay so a page never loads an address the app chose, and served so that a
  // browser cannot take it for anything but the image it is.
  app.get("/api/client-icons/:clientId", async (c) => {
    const icon = await findClientIcon(exterior, c.req.param("clientId"));
    if (!icon) return c.body(null, 404);
    return c.body(new Uint8Array(icon.bytes), 200, {
      "content-type": icon.type,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
    });
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
    return c.json({ revoked: true });
  });
}
