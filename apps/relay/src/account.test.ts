import assert from "node:assert/strict";
import { machinesScope } from "@mukae/contract";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { test } from "vitest";
import { mountAccountPages } from "./account.js";
import type { RelayEnv } from "./app.js";
import { openMukaeAuth } from "./auth.js";
import { ensureDaemonClient, registerClient } from "./clients.js";

test("github sign-in sends the state cookie the callback checks", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
    origins: ["http://127.0.0.1:47100"],
  });
  const app = new Hono<RelayEnv>();
  mountAccountPages(app, mukae, true);
  app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));

  const started = await app.request(`${publicUrl}/sign-in/github`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ query: "" }),
  });
  assert.equal(started.status, 302);
  const cookies = started.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => cookie.split("=")[0]?.endsWith("better-auth.state")));
  const state = new URL(started.headers.get("location") ?? "").searchParams.get("state");
  assert.ok(state);

  const callback = await app.request(`${publicUrl}/api/auth/callback/github?state=${state}&code=not-a-github-code`, {
    headers: { cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; ") },
  });
  const error = new URL(callback.headers.get("location") ?? publicUrl).searchParams.get("error");
  assert.equal(error, "invalid_code");
});

test("approving a web app redirects back with an authorization code", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const redirectUri = "http://127.0.0.1:47100/oauth/callback";
  const secret = "test-secret-test-secret-test-secret";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
    origins: ["http://127.0.0.1:47100"],
  });
  const context = await mukae.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const registered = await registerClient(mukae, user.id, {
    clientName: "Example",
    redirectUris: [redirectUri],
    confidential: false,
  });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const app = new Hono<RelayEnv>();
  mountAccountPages(app, mukae, true);
  app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));

  const authorize = new URL("/api/auth/oauth2/authorize", publicUrl);
  authorize.searchParams.set("client_id", registered.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", machinesScope);
  authorize.searchParams.set("state", "browser-state");
  authorize.searchParams.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("resource", publicUrl);
  const prompted = await app.request(authorize, { headers: { cookie } });
  assert.equal(prompted.status, 302);
  const consent = new URL(prompted.headers.get("location") ?? "", publicUrl);
  assert.equal(consent.pathname, "/consent");

  const approved = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "yes", query: consent.search.slice(1) }),
  });
  assert.equal(approved.status, 302);
  const back = new URL(approved.headers.get("location") ?? "");
  assert.equal(back.origin + back.pathname, redirectUri);
  assert.equal(back.searchParams.get("state"), "browser-state");
  assert.equal(typeof back.searchParams.get("code"), "string");
});

test("approving a machine claims the code before it is approved", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const secret = "test-secret-test-secret-test-secret";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
    origins: ["http://127.0.0.1:47100"],
  });
  const daemonClientId = await ensureDaemonClient(mukae);
  const context = await mukae.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const app = new Hono<RelayEnv>();
  mountAccountPages(app, mukae, true);
  app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));

  const started = await app.request(`${publicUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: daemonClientId, scope: machinesScope, resource: publicUrl }),
  });
  assert.equal(started.status, 200);
  const pending = (await started.json()) as { user_code?: string; device_code?: string };
  assert.equal(typeof pending.user_code, "string");
  assert.equal(typeof pending.device_code, "string");

  const page = await app.request(`${publicUrl}/device?user_code=${pending.user_code}`, { headers: { cookie } });
  assert.equal(page.status, 200);

  const approved = await app.request(`${publicUrl}/device`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ userCode: pending.user_code ?? "", decision: "approve" }),
  });
  const approvedText = await approved.text();
  assert.equal(approved.status, 200, approvedText);
  assert.match(approvedText, /Machine approved/);

  const discovery = await app.request(`${publicUrl}/api/auth/.well-known/openid-configuration`);
  const metadata = (await discovery.json()) as { token_endpoint?: string };
  const token = await app.request(metadata.token_endpoint ?? "", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: pending.device_code ?? "",
      client_id: daemonClientId,
      resource: publicUrl,
    }),
  });
  const tokenText = await token.text();
  assert.equal(token.status, 200, tokenText);
  const body = JSON.parse(tokenText) as { access_token?: string };
  assert.equal(typeof body.access_token, "string");
});

async function sessionCookie(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `better-auth.session_token=${token}.${encoded}`;
}
