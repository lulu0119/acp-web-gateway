import assert from "node:assert/strict";
import Database from "better-sqlite3";
import type { Hono } from "hono";
import { test } from "vitest";
import type { RelayEnv } from "../http.js";
import { openExteriorAuth, type ExteriorAuth } from "../identity/auth.js";
import { prunePendingClients } from "../identity/clients.js";
import { createTestApp } from "../testing.js";

const publicUrl = "http://127.0.0.1:8787";
const secret = "test-secret-test-secret-test-secret";

test("registration needs a signed-in account, approval requests do not", async () => {
  const { app } = await openRegistry();
  const gated = await app.request(`${publicUrl}/api/clients/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientName: "Studio", redirectUris: ["https://app.example.test/callback"], confidential: false }),
  });
  assert.equal(gated.status, 401);

  const open = await app.request(`${publicUrl}/api/authorize-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientName: "Studio",
      redirectUri: "https://app.example.test/callback",
      scopes: ["devices", "offline_access"],
      state: "browser-state",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    }),
  });
  assert.equal(open.status, 200);
  const started = (await open.json()) as { url?: string };
  assert.match(started.url ?? "", /client_id=/);

  const spoofed = await app.request(`${publicUrl}/api/authorize-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientName: "Exterior Official",
      redirectUri: "https://app.example.test/callback",
      scopes: ["devices"],
      state: "browser-state",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    }),
  });
  assert.equal(spoofed.status, 400);
});

test("the birth certificate is issued at approval, not before", async () => {
  const { app, cookie } = await openRegistry();
  const started = await app.request(`${publicUrl}/api/authorize-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientName: "Studio",
      redirectUri: "https://app.example.test/callback",
      scopes: ["devices", "offline_access"],
      state: "browser-state",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    }),
  });
  assert.equal(started.status, 200);
  const { url } = (await started.json()) as { url: string };
  const authorize = new URL(url);
  const clientId = authorize.searchParams.get("client_id") ?? "";
  assert.ok(clientId);

  const prompted = await app.request(url, { headers: { cookie } });
  assert.equal(prompted.status, 302);
  const consent = new URL(prompted.headers.get("location") ?? "", publicUrl);
  assert.equal(consent.pathname, "/consent");

  const page = await app.request(`${publicUrl}/consent?${consent.search.slice(1)}`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Studio/);

  const approved = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "yes", query: consent.search.slice(1) }),
  });
  assert.equal(approved.status, 302);
  const back = new URL(approved.headers.get("location") ?? "");
  assert.equal(back.origin + back.pathname, "https://app.example.test/callback");
  assert.equal(typeof back.searchParams.get("code"), "string");

  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as {
    apps: { clientId: string; clientName: string }[];
  };
  assert.deepEqual(
    listed.apps.map((item) => ({ clientId: item.clientId, clientName: item.clientName })),
    [{ clientId, clientName: "Studio" }],
  );
});

test("an app signing in again reuses its client, skips the consent it has, and takes its latest name and logo", async () => {
  const { app, cookie } = await openRegistry();
  const studio = { clientName: "Studio", redirectUri: "https://app.example.test/callback", scopes: ["devices"] };
  const first = await startApproval(app, studio);
  const firstClient = new URL(first).searchParams.get("client_id") ?? "";
  const prompted = await app.request(first, { headers: { cookie } });
  const query = new URL(prompted.headers.get("location") ?? "", publicUrl).search.slice(1);
  const approved = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "yes", query }),
  });
  assert.equal(approved.status, 302);

  const again = await startApproval(app, studio);
  assert.equal(new URL(again).searchParams.get("client_id"), firstClient);
  const remembered = await app.request(again, { headers: { cookie } });
  const back = new URL(remembered.headers.get("location") ?? "", publicUrl);
  assert.equal(back.origin + back.pathname, "https://app.example.test/callback");
  assert.equal(typeof back.searchParams.get("code"), "string");

  const wider = await startApproval(app, { ...studio, scopes: ["devices", "offline_access"] });
  assert.equal(new URL(wider).searchParams.get("client_id"), firstClient);

  const renamed = await startApproval(app, { ...studio, clientName: "Studio Next", logo: `data:image/png;base64,${onePixelPng}` });
  assert.equal(new URL(renamed).searchParams.get("client_id"), firstClient);

  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as {
    apps: { clientId: string; clientName: string; origin?: string; iconUrl?: string }[];
  };
  assert.deepEqual(
    listed.apps.map((item) => ({ clientId: item.clientId, clientName: item.clientName, origin: item.origin })),
    [{ clientId: firstClient, clientName: "Studio Next", origin: "https://app.example.test" }],
  );
  const icon = await app.request(`${publicUrl}${listed.apps[0]?.iconUrl ?? "/missing"}`);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get("content-type"), "image/png");
  assert.equal(icon.headers.get("x-content-type-options"), "nosniff");
  assert.equal(icon.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()), Buffer.from(onePixelPng, "base64"));
});

test("an app on this computer is asked every time, and so is one that asks for consent", async () => {
  const { app, cookie } = await openRegistry();
  const local = { clientName: "Studio", redirectUri: "http://localhost:5173/callback", scopes: ["devices"] };
  await approve(app, cookie, await startApproval(app, local));

  for (const prompt of [undefined, "none"]) {
    const again = new URL(await startApproval(app, local));
    if (prompt) again.searchParams.set("prompt", prompt);
    const asked = await app.request(again, { headers: { cookie } });
    const consent = new URL(asked.headers.get("location") ?? "", publicUrl);
    assert.equal(consent.pathname, "/consent", `prompt=${prompt ?? "(none given)"}`);
    const page = await app.request(`${publicUrl}/consent?${consent.search.slice(1)}`, { headers: { cookie } });
    assert.equal(page.status, 200);
  }

  const remote = { clientName: "Notes", redirectUri: "https://notes.example.test/callback", scopes: ["devices"] };
  await approve(app, cookie, await startApproval(app, remote));
  const forced = new URL(await startApproval(app, remote));
  forced.searchParams.set("prompt", "consent");
  const asked = await app.request(forced, { headers: { cookie } });
  const consent = new URL(asked.headers.get("location") ?? "", publicUrl);
  assert.equal(consent.pathname, "/consent");
  const page = await app.request(`${publicUrl}/consent?${consent.search.slice(1)}`, { headers: { cookie } });
  assert.equal(page.status, 200);
});

test("an app's logo must be a small raster image that is what it says", async () => {
  const { app } = await openRegistry();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64");
  for (const logo of [
    `data:image/svg+xml;base64,${svg}`,
    `data:image/jpeg;base64,${onePixelPng}`,
    `data:image/png;base64,${Buffer.alloc(64 * 1024 + 1, 0x89).toString("base64")}`,
    "https://app.example.test/logo.png",
  ]) {
    const started = await app.request(`${publicUrl}/api/authorize-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientName: "Studio",
        logo,
        redirectUri: "https://app.example.test/callback",
        scopes: ["devices"],
        state: "browser-state",
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      }),
    });
    assert.equal(started.status, 400, logo.slice(0, 30));
  }
});

test("denied approvals leave no grant and abandoned ones are pruned", async () => {
  const { app, cookie, exterior } = await openRegistry();
  const started = await app.request(`${publicUrl}/api/authorize-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientName: "Dither",
      redirectUri: "https://dither.example.test/callback",
      scopes: ["devices"],
      state: "browser-state",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    }),
  });
  const { url } = (await started.json()) as { url: string };
  const clientId = new URL(url).searchParams.get("client_id") ?? "";
  assert.ok(clientId);

  const prompted = await app.request(url, { headers: { cookie } });
  const query = new URL(prompted.headers.get("location") ?? "", publicUrl).search.slice(1);
  const denied = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "no", query }),
  });
  assert.equal(denied.status, 302);
  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as { apps: unknown[] };
  assert.deepEqual(listed.apps, []);

  assert.equal(await prunePendingClients(exterior, 0), 1);
  assert.equal(await prunePendingClients(exterior, 0), 0);
});
test("a signed-in account registers, lists, revokes, and re-approves", async () => {
  const { app, cookie } = await openRegistry();
  const registered = await app.request(`${publicUrl}/api/clients/register`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ clientName: "Studio", redirectUris: ["https://app.example.test/callback"], confidential: true }),
  });
  assert.equal(registered.status, 201);
  const created = (await registered.json()) as { clientId?: string; clientSecret?: string };
  assert.ok(created.clientId);
  assert.ok(created.clientSecret);

  const rejected = await app.request(`${publicUrl}/api/clients/register`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ clientName: "Exterior Clone", redirectUris: ["https://app.example.test/callback"], confidential: false }),
  });
  assert.equal(rejected.status, 400);

  const clientId = created.clientId ?? "";
  const firstLocation = await authorizeLocation(app, cookie, clientId, "https://app.example.test/callback");
  assert.equal(new URL(firstLocation, publicUrl).pathname, "/consent");
  const query = new URL(firstLocation, publicUrl).search.slice(1);

  const first = await app.request(`${publicUrl}/consent?${query}`, { headers: { cookie } });
  assert.equal(first.status, 200);
  const approved = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "yes", query }),
  });
  assert.equal(approved.status, 302);

  const listed = await app.request(`${publicUrl}/api/grants`, { headers: { cookie } });
  assert.equal(listed.status, 200);
  const grants = (await listed.json()) as { apps: { clientId: string; clientName: string }[] };
  assert.deepEqual(
    grants.apps.map((item) => ({ clientId: item.clientId, clientName: item.clientName })),
    [{ clientId, clientName: "Studio" }],
  );

  const secondLocation = await authorizeLocation(app, cookie, clientId, "https://app.example.test/callback");
  const remembered = new URL(secondLocation);
  assert.equal(remembered.origin + remembered.pathname, "https://app.example.test/callback");
  assert.equal(typeof remembered.searchParams.get("code"), "string");

  const revoked = await app.request(`${publicUrl}/api/grants/revoke`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  assert.equal(revoked.status, 200);

  const emptied = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as { apps: unknown[] };
  assert.deepEqual(emptied.apps, []);

  const thirdLocation = await authorizeLocation(app, cookie, clientId, "https://app.example.test/callback");
  assert.equal(new URL(thirdLocation, publicUrl).pathname, "/consent");
  const thirdQuery = new URL(thirdLocation, publicUrl).search.slice(1);
  const asked = await app.request(`${publicUrl}/consent?${thirdQuery}`, { headers: { cookie } });
  assert.equal(asked.status, 200);
});

const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function startApproval(app: Hono<RelayEnv>, input: { clientName: string; redirectUri: string; scopes: string[]; logo?: string }): Promise<string> {
  const started = await app.request(`${publicUrl}/api/authorize-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, state: "browser-state", codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" }),
  });
  assert.equal(started.status, 200);
  return ((await started.json()) as { url: string }).url;
}

/** Opens an approval address as the signed-in person and authorizes it on the consent page. */
async function approve(app: Hono<RelayEnv>, cookie: string, url: string): Promise<void> {
  const prompted = await app.request(url, { headers: { cookie } });
  const query = new URL(prompted.headers.get("location") ?? "", publicUrl).search.slice(1);
  const approved = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "yes", query }),
  });
  assert.equal(approved.status, 302);
  assert.match(approved.headers.get("location") ?? "", /[?&]code=/);
}

async function authorizeLocation(app: Hono<RelayEnv>, cookie: string, clientId: string, redirectUri: string): Promise<string> {
  const authorize = new URL("/api/auth/oauth2/authorize", publicUrl);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "devices offline_access");
  authorize.searchParams.set("state", "browser-state");
  authorize.searchParams.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("resource", publicUrl);
  const prompted = await app.request(authorize, { headers: { cookie } });
  assert.equal(prompted.status, 302);
  return prompted.headers.get("location") ?? "";
}

async function openRegistry() {
  const exterior: ExteriorAuth = await openExteriorAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const { app } = await createTestApp(exterior);
  return { app, exterior, cookie: await sessionCookie(session.token, secret) };
}

async function sessionCookie(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `better-auth.session_token=${token}.${encoded}`;
}
