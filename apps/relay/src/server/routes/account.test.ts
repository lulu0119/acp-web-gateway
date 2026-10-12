import assert from "node:assert/strict";
import { devicesPath, machinesScope } from "@mukae/contract";
import Database from "better-sqlite3";
import { createServer } from "node:net";
import { serve } from "@hono/node-server";
import { onTestFinished, test } from "vitest";
import { openMukaeAuth } from "../identity/auth.js";
import { ensureDaemonClient, registerClient } from "../identity/clients.js";
import { createTestApp } from "../testing.js";

test("github sign-in sends the state cookie the callback checks", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const { app } = await createTestApp(mukae);

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
  const { app } = await createTestApp(mukae);

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

// Served on a real port: verifying the device's access token fetches the relay's own JWKS.
test("an approved device appears on the dashboard once its sign-in records it", async () => {
  const port = await freePort();
  const publicUrl = `http://127.0.0.1:${port}`;
  const secret = "test-secret-test-secret-test-secret";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const daemonClientId = await ensureDaemonClient(mukae);
  const context = await mukae.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const { app } = await createTestApp(mukae);
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  onTestFinished(() => {
    server.close();
  });

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
  assert.match(approvedText, /Device connected/);

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

  const recorded = await app.request(`${publicUrl}${devicesPath}`, {
    method: "POST",
    headers: { authorization: `Bearer ${body.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ deviceId: "device-studio-1", hostname: "studio" }),
  });
  assert.equal(recorded.status, 200, await recorded.clone().text());
  const dashboard = await app.request(`${publicUrl}/api/dashboard`, { headers: { cookie } });
  const data = (await dashboard.json()) as { devices: { id: string; hostname: string; machineId?: string }[] };
  assert.deepEqual(data.devices.map(({ id, hostname, machineId }) => ({ id, hostname, machineId })), [
    { id: "device-studio-1", hostname: "studio", machineId: undefined },
  ]);

  const asWebApp = await app.request(`${publicUrl}/api/machines`, { headers: { authorization: `Bearer ${body.access_token}` } });
  assert.equal(asWebApp.status, 403);
});

test("an expired approval link offers to start again instead of failing", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const secret = "test-secret-test-secret-test-secret";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const context = await mukae.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const { app } = await createTestApp(mukae);
  const query = "client_id=studio&redirect_uri=https%3A%2F%2Fstudio.example.test%2Fcallback&state=s&exp=1&ba_iat=1&ba_param=state&sig=stale";

  const shown = await app.request(`${publicUrl}/consent?${query}`, { headers: { cookie } });
  assert.equal(shown.status, 400);
  const shownText = await shown.text();
  assert.match(shownText, /This approval link expired/);
  assert.equal(shown.headers.get("x-frame-options"), "DENY");
  assert.match(shownText, /href="\/api\/auth\/oauth2\/authorize\?client_id=studio&amp;redirect_uri=[^"]*&amp;state=s"/);

  const decided = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "yes", query }),
  });
  assert.equal(decided.status, 400);
  assert.match(await decided.text(), /Start again/);
});

test("a wrong device code keeps the person on the code form with the reason", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const secret = "test-secret-test-secret-test-secret";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const context = await mukae.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const { app } = await createTestApp(mukae);

  const page = await app.request(`${publicUrl}/device?user_code=WXYZ-2345`, { headers: { cookie } });
  assert.equal(page.status, 400);
  const text = await page.text();
  assert.match(text, /name="user_code"/);
  assert.match(text, /role="alert"/);
});

async function sessionCookie(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `better-auth.session_token=${token}.${encoded}`;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}
