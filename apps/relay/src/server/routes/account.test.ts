import assert from "node:assert/strict";
import { once } from "node:events";
import { exteriorDeviceClient } from "@exterior/contract";
import { clientScope, deviceCloseCodes, devicesPath, deviceScope, deviceSocketPath, relayWebSocketUrl } from "@exterioragentprotocol/sdk";
import { beginDeviceAuthorization, deviceIdOf, dpopProof, generateDeviceKey, pollDeviceAuthorization, refreshAccessToken, RefreshTokenRejectedError } from "@exterioragentprotocol/sdk/device";
import { WebSocket } from "ws";
import Database from "better-sqlite3";
import { createServer } from "node:net";
import { serve } from "@hono/node-server";
import { onTestFinished, test } from "vitest";
import { openExteriorAuth } from "../identity/auth.js";
import { registerClient } from "../identity/clients.js";
import { createTestApp } from "../testing.js";

test("github sign-in sends the state cookie the callback checks", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const { app } = await createTestApp(exterior);

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
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const registered = await registerClient(exterior, user.id, {
    clientName: "Example",
    redirectUris: [redirectUri],
    confidential: false,
  });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const { app } = await createTestApp(exterior);

  const authorize = new URL("/api/auth/oauth2/authorize", publicUrl);
  authorize.searchParams.set("client_id", registered.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", `${clientScope} offline_access`);
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

// Served on a real port: the device signs in through the SDK, which discovers the relay and fetches its JWKS.
test("a device signs in with a key, connects as that key, and removing it signs it out", async () => {
  const port = await freePort();
  const publicUrl = `http://127.0.0.1:${port}`;
  const secret = "test-secret-test-secret-test-secret";
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const { app, injectWebSocket } = await createTestApp(exterior);
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  injectWebSocket(server);
  onTestFinished(() => {
    server.close();
  });

  // Exterior's device software is a metadata document the relay knows; the device itself is a key.
  const key = await generateDeviceKey();
  const deviceId = await deviceIdOf(key);
  const pending = await beginDeviceAuthorization({ relayUrl: publicUrl, clientId: exteriorDeviceClient.client_id });
  assert.equal((await app.request(`${publicUrl}/device?user_code=${pending.userCode}`, { headers: { cookie } })).status, 200);
  const approved = await app.request(`${publicUrl}/device`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ userCode: pending.userCode, decision: "approve" }),
  });
  assert.match(await approved.text(), /Device connected/);
  const tokens = await pollDeviceAuthorization(pending, key);
  const refreshToken = tokens.refreshToken ?? "";

  // The token is bound to the key: without a proof it opens nothing.
  const bare = new WebSocket(relayWebSocketUrl(publicUrl, deviceSocketPath), { headers: { authorization: `Bearer ${tokens.accessToken}` } });
  const [, refused] = (await once(bare, "unexpected-response")) as [unknown, { statusCode: number }];
  assert.equal(refused.statusCode, 401);
  const asClient = await app.request(`${publicUrl}${devicesPath}`, {
    headers: { authorization: `DPoP ${tokens.accessToken}`, dpop: await dpopProof(key, "GET", `${publicUrl}${devicesPath}`, tokens.accessToken) },
  });
  assert.equal(asClient.status, 403);

  const connect = async () => {
    const url = relayWebSocketUrl(publicUrl, deviceSocketPath);
    const socket = new WebSocket(url, { headers: { authorization: `DPoP ${tokens.accessToken}`, dpop: await dpopProof(key, "GET", url, tokens.accessToken) } });
    await once(socket, "open");
    socket.send(JSON.stringify({ type: "hello", hostname: "studio", platform: "linux", workingDirectory: "/home/ada/work", agents: [] }));
    return socket;
  };
  const control = await connect();
  const dashboard = async () => ((await (await app.request(`${publicUrl}/api/dashboard`, { headers: { cookie } })).json()) as { devices: { id: string; hostname: string; online: boolean }[] }).devices;
  await waitFor(async () => (await dashboard()).length === 1);
  assert.deepEqual((await dashboard()).map(({ id, hostname, online }) => ({ id, hostname, online })), [{ id: deviceId, hostname: "studio", online: true }]);

  // Removing the device closes its socket, and the access token it still holds no longer opens one.
  const closed = once(control, "close");
  const removed = await app.request(`${publicUrl}/api/devices/remove`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.equal(((await closed) as [number])[0], deviceCloseCodes.revoked);
  assert.deepEqual(await dashboard(), []);
  const again = await connect();
  assert.equal(((await once(again, "close")) as [number])[0], deviceCloseCodes.revoked);
  await assert.rejects(refreshAccessToken({ relayUrl: publicUrl, clientId: exteriorDeviceClient.client_id, refreshToken, deviceKey: key }), RefreshTokenRejectedError);
  // The device polls at the interval the provider names, five seconds.
}, 20_000);

test("one OAuth client holds one role: device software never signs in through a browser, and a web app never with a device code", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const { app } = await createTestApp(exterior);
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const webApp = await registerClient(exterior, user.id, { clientName: "Studio", redirectUris: ["http://127.0.0.1:5173/callback"], confidential: false });
  const webAppCode = await app.request(`${publicUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: webApp.clientId, scope: deviceScope, resource: publicUrl }),
  });
  assert.equal(((await webAppCode.json()) as { error: string }).error, "unauthorized_client");
  const code = await app.request(`${publicUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "any", scope: clientScope, resource: publicUrl }),
  });
  assert.equal(code.status, 400);
  assert.equal(((await code.json()) as { error: string }).error, "invalid_scope");
  const authorize = new URL("/api/auth/oauth2/authorize", publicUrl);
  authorize.searchParams.set("client_id", "any");
  authorize.searchParams.set("scope", deviceScope);
  assert.equal((await app.request(authorize)).status, 400);
});

test("an expired approval link offers to start again instead of failing", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const secret = "test-secret-test-secret-test-secret";
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const { app } = await createTestApp(exterior);
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
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await sessionCookie(session.token, secret);
  const { app } = await createTestApp(exterior);

  const page = await app.request(`${publicUrl}/device?user_code=WXYZ-2345`, { headers: { cookie } });
  assert.equal(page.status, 400);
  const text = await page.text();
  assert.match(text, /name="user_code"/);
  assert.match(text, /role="alert"/);
  assert.match(text, /sign in again there for a new one/);
});

async function sessionCookie(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `better-auth.session_token=${token}.${encoded}`;
}

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 100 && !(await condition()); tries += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(await condition());
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
