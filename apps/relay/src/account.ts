import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { Hono } from "hono";
import type { MukaeAuth } from "./auth.js";
import type { RelayEnv } from "./app.js";
import { readAccount } from "./account-session.js";
import { findClientMeta, hasRememberedGrant } from "./grants.js";
import { approvePendingClient } from "./clients.js";
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
      returnHeaders: true,
    });
    if (!result.response.url) return c.html(messagePage("Sign in", "GitHub did not return a sign-in address."), 502);
    const response = c.redirect(result.response.url);
    for (const cookie of result.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  });

  app.get("/consent", async (c) => {
    const query = continuationQuery(c.req.url);
    const secret = (await mukae.auth.$context).secret;
    if (!(await verifyOAuthQueryParams(query, secret))) return c.html(messagePage("Approve", "This approval link is no longer valid."), 400);
    const params = new URLSearchParams(query);
    const clientId = params.get("client_id") ?? "";
    const scopes = (params.get("scope") ?? "").split(" ").filter((scope) => scope.length > 0);
    const account = await readAccount(c.req.raw, mukae);
    if (account && clientId && (await hasRememberedGrant(mukae, account, clientId, scopes))) {
      const approved = await mukae.auth.api.oauth2Consent({
        body: { accept: true, oauth_query: query },
        headers: c.req.raw.headers,
        request: c.req.raw,
        asResponse: false,
      });
      if (approved.redirect) return c.redirect(approved.url);
    }
    const meta = clientId ? await findClientMeta(mukae, clientId) : undefined;
    return c.html(
      consentPage({
        query,
        clientId,
        clientName: meta?.clientName ?? clientId,
        redirectUri: params.get("redirect_uri") ?? "",
        scope: params.get("scope") ?? "",
      }),
    );
  });

  app.post("/consent", async (c) => {
    const body = await c.req.parseBody();
    const query = typeof body.query === "string" ? body.query : "";
    const accept = body.accept === "yes";
    const result = await mukae.auth.api.oauth2Consent({
      body: { accept, oauth_query: query },
      headers: c.req.raw.headers,
      request: c.req.raw,
      asResponse: false,
    });
    if (result.redirect) {
      const clientId = new URLSearchParams(query).get("client_id") ?? "";
      if (accept && clientId && (await approvePendingClient(mukae, clientId))) {
        const back = new URL(result.url);
        back.searchParams.set("client_id", clientId);
        return c.redirect(back.href);
      }
      return c.redirect(result.url);
    }
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
    try {
      await mukae.auth.api.deviceVerify({ query: { user_code: userCode }, headers: c.req.raw.headers });
    } catch (error) {
      return c.html(messagePage("Approve machine", described(error)), 400);
    }
    return c.html(devicePage({ userCode }));
  });

  app.post("/device", async (c) => {
    const body = await c.req.parseBody();
    const userCode = typeof body.userCode === "string" ? body.userCode : "";
    const decision = body.decision === "approve" ? "approve" : "deny";
    if (!userCode) return c.html(messagePage("Approve machine", "Enter the code from the machine."), 400);
    const endpoint = decision === "approve" ? mukae.auth.api.deviceApprove : mukae.auth.api.deviceDeny;
    try {
      await endpoint({ body: { userCode }, headers: c.req.raw.headers });
    } catch (error) {
      return c.html(messagePage("Approve machine", described(error)), 400);
    }
    const title = decision === "approve" ? "Machine approved" : "Machine denied";
    return c.html(messagePage(title, decision === "approve" ? "Return to the machine. It will connect on its own." : "The machine was not approved."));
  });
}

function continuationQuery(requestUrl: string): string {
  const query = new URL(requestUrl).search.slice(1);
  return query.startsWith("next=") ? "" : query;
}

function described(error: unknown): string {
  if (typeof error === "object" && error !== null && "body" in error) {
    const body = error.body;
    if (typeof body === "object" && body !== null && "error_description" in body && typeof body.error_description === "string") {
      return body.error_description;
    }
  }
  return "Mukae could not finish approval.";
}

function safeNext(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}
