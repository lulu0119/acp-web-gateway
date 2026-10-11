import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { Hono } from "hono";
import type { MukaeAuth } from "./auth.js";
import type { RelayEnv } from "./app.js";
import { consentPage, deviceCodePage, devicePage, messagePage, signInPage } from "./pages.js";

export function mountAccountPages(app: Hono<RelayEnv>, mukae: MukaeAuth, githubConfigured: boolean): void {
  app.get("/sign-in", async (c) => {
    const session = await mukae.auth.api.getSession({ headers: c.req.raw.headers });
    const next = safeNext(c.req.query("next"));
    if (session && next) return c.redirect(next);
    const query = continuationQuery(c.req.url);
    if (session && query.includes("client_id=")) return c.redirect(`/api/auth/oauth2/authorize?${query}`);
    return c.html(signInPage({ query, configured: githubConfigured }));
  });

  app.post("/sign-in/github", async (c) => {
    const body = await c.req.parseBody();
    const query = typeof body.query === "string" ? body.query : "";
    const callbackURL = query ? `/sign-in?${query}` : "/";
    const result = await mukae.auth.api.signInSocial({
      body: { provider: "github", callbackURL, disableRedirect: true },
      headers: c.req.raw.headers,
    });
    if (result.url) return c.redirect(result.url);
    return c.html(messagePage("Sign in", "GitHub did not return a sign-in address."), 502);
  });

  app.get("/consent", async (c) => {
    const query = continuationQuery(c.req.url);
    const secret = (await mukae.auth.$context).secret;
    if (!(await verifyOAuthQueryParams(query, secret))) return c.html(messagePage("Approve", "This approval link is no longer valid."), 400);
    const params = new URLSearchParams(query);
    return c.html(consentPage({ query, clientId: params.get("client_id") ?? "", scope: params.get("scope") ?? "" }));
  });

  app.post("/consent", async (c) => {
    const body = await c.req.parseBody();
    const query = typeof body.query === "string" ? body.query : "";
    const accept = body.accept === "yes";
    const result = await mukae.auth.api.oauth2Consent({
      body: { accept, oauth_query: query },
      headers: c.req.raw.headers,
    });
    if (result.redirect) return c.redirect(result.url);
    return c.html(messagePage("Approve", "Mukae could not finish approval."), 502);
  });

  app.get("/device", async (c) => {
    const session = await mukae.auth.api.getSession({ headers: c.req.raw.headers });
    const userCode = c.req.query("user_code") ?? "";
    if (!session) {
      const next = userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : "/device";
      return c.redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    }
    if (!userCode) return c.html(deviceCodePage());
    return c.html(devicePage({ userCode }));
  });

  app.post("/device", async (c) => {
    const body = await c.req.parseBody();
    const userCode = typeof body.userCode === "string" ? body.userCode : "";
    const decision = body.decision === "approve" ? "approve" : "deny";
    if (!userCode) return c.html(messagePage("Approve machine", "Enter the code from the machine."), 400);
    const endpoint = decision === "approve" ? mukae.auth.api.deviceApprove : mukae.auth.api.deviceDeny;
    await endpoint({ body: { userCode }, headers: c.req.raw.headers });
    const title = decision === "approve" ? "Machine approved" : "Machine denied";
    return c.html(messagePage(title, decision === "approve" ? "Return to the machine. It will connect on its own." : "The machine was not approved."));
  });
}

function continuationQuery(requestUrl: string): string {
  const query = new URL(requestUrl).search.slice(1);
  return query.startsWith("next=") ? "" : query;
}

function safeNext(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}
