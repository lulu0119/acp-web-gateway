import { appSetupPath, appSetupResultPath, clientRegistryPath, grantsPath } from "@exterior/contract";
import type { Hono } from "hono";
import { readAccount } from "../identity/session.js";
import type { RelayEnv } from "../http.js";
import type { ExteriorAuth } from "../identity/auth.js";
import { parseClientRegistration, registerClient } from "../identity/clients.js";
import { listGrantedApps, revokeGrant } from "../identity/grants.js";
import { appSetupPage, createAppSetupResults, isSetupId, parseAppSetup, readAppSetupApproval } from "../identity/app-setup.js";
import type { PageRenderer } from "../rendering/render-page.js";

/** `revokeClient` ends what the client holds open once the account revokes it. */
export function mountClients(app: Hono<RelayEnv>, exterior: ExteriorAuth, revokeClient: (input: { userId: string; clientId: string }) => void, render: PageRenderer): void {
  const results = createAppSetupResults();
  app.get(appSetupPath, async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    const setup = parseAppSetup(new URL(c.req.url).searchParams);
    if (typeof setup === "string") return c.html(render.account({ kind: "message", tone: "error", title: "App setup could not start", message: setup }), 400);
    const account = await readAccount(c.req.raw, exterior);
    if (!account) return c.redirect(`/sign-in?next=${encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search)}`);
    return c.html(render.account(await appSetupPage(exterior, account, setup)));
  });

  app.get(`${appSetupResultPath}/:setupId`, (c) => {
    c.header("Cache-Control", "no-store");
    const setupId = c.req.param("setupId");
    if (!isSetupId(setupId)) return c.json({ message: "Choose a setup id of 22 to 128 letters, digits, - or _." }, 400);
    const outcome = results.get(setupId);
    return outcome ? c.json(outcome) : c.json({ status: "pending" }, 202);
  });

  app.post(clientRegistryPath, async (c) => {
    const account = await readAccount(c.req.raw, exterior);
    if (c.req.header("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      c.header("Cache-Control", "no-store");
      const body = await c.req.parseBody();
      const setup = await readAppSetupApproval(exterior, typeof body.approval === "string" ? body.approval : "");
      if (!setup) return c.html(render.account({ kind: "message", tone: "error", title: "This setup link expired", message: "Ask your coding assistant for a new setup link." }), 400);
      if (!account) {
        const next = `${appSetupPath}?${new URLSearchParams({ setup_id: setup.setupId, client_name: setup.clientName, redirect_uri: setup.redirectUri })}`;
        return c.redirect(`/sign-in?next=${encodeURIComponent(next)}`);
      }
      if (setup.userId !== account.userId) return c.html(render.account({ kind: "message", tone: "error", title: "The signed-in account changed", message: "Open the setup link from your coding assistant again, then confirm with the account you want to use." }), 400);
      if (body.decision !== "register" && body.decision !== "deny") return c.json({ message: "Choose Register app or Cancel." }, 400);
      let outcome;
      try {
        outcome = await results.decide(setup, async () => {
          if (body.decision === "deny") return { status: "denied" };
          try {
            const registered = await registerClient(exterior, account.userId, { clientName: setup.clientName, redirectUris: [setup.redirectUri], confidential: false });
            return { status: "registered", clientId: registered.clientId, clientName: setup.clientName, redirectUri: setup.redirectUri };
          } catch (error) {
            return { status: "failed", code: "registration_failed", message: error instanceof Error ? error.message : "Exterior could not register the app." };
          }
        });
      } catch (error) {
        return c.html(render.account({ kind: "message", tone: "error", title: "App setup could not finish", message: error instanceof Error ? error.message : "Ask your coding assistant for a new setup link." }), 400);
      }
      if (outcome.status === "failed") return c.html(render.account({ kind: "message", tone: "error", title: "App registration failed", message: `${outcome.message} Return to your coding assistant to continue.` }), 502);
      return c.html(render.account({
        kind: "message", tone: outcome.status === "registered" ? "success" : "neutral",
        title: outcome.status === "registered" ? `${setup.clientName} registered` : "App setup cancelled",
        message: outcome.status === "registered" ? "Return to your coding assistant to continue setup." : "Return to your coding assistant.",
      }));
    }
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
    revokeClient({ userId: account.userId, clientId });
    return c.json({ revoked: true });
  });
}
