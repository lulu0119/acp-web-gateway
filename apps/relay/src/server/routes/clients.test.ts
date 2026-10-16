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

test("the relay publishes how an app registers itself or names its metadata document", async () => {
  const { app } = await openRegistry();
  const metadata = (await (await app.request(`${publicUrl}/api/auth/.well-known/openid-configuration`)).json()) as Record<string, unknown>;
  assert.equal(metadata.registration_endpoint, `${publicUrl}/api/auth/oauth2/register`);
  assert.equal(metadata.client_id_metadata_document_supported, true);
});

test("an app registers itself without an account, but cannot pose as Exterior or as a registered client", async () => {
  const { app, exterior } = await openRegistry();
  const gated = await app.request(`${publicUrl}/api/clients/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientName: "Studio", redirectUris: ["https://app.example.test/callback"], confidential: false }),
  });
  assert.equal(gated.status, 401);

  const clientId = await registerApp(app, { client_name: "Studio", redirect_uris: ["https://app.example.test/callback"], software_id: "exterior-user-client:someone:1" });
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<{ clientId: string; softwareId: string }>({ model: "oauthClient", where: [{ field: "clientId", value: clientId }] });
  assert.match(rows[0]?.softwareId ?? "", /^exterior-pending:/);

  const spoofed = await app.request(`${publicUrl}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...publicApp, client_name: "Exterior Official", redirect_uris: ["https://app.example.test/callback"] }),
  });
  assert.equal(spoofed.status, 400);
});

test("a registered app approved once comes straight back, and is one authorized app", async () => {
  const { app, cookie } = await openRegistry();
  const redirectUri = "https://app.example.test/callback";
  const clientId = await registerApp(app, { client_name: "Studio", redirect_uris: [redirectUri], logo_uri: "https://app.example.test/logo.png" });

  const consent = new URL(await authorizeLocation(app, cookie, clientId, redirectUri), publicUrl);
  assert.equal(consent.pathname, "/consent");
  const page = await (await app.request(`${publicUrl}/consent?${consent.search.slice(1)}`, { headers: { cookie } })).text();
  assert.match(page, /Studio/);
  assert.match(page, /Unverified/);
  assert.match(page, /src="https:\/\/app\.example\.test\/logo\.png"/);
  await approveQuery(app, cookie, consent.search.slice(1));

  const back = new URL(await authorizeLocation(app, cookie, clientId, redirectUri));
  assert.equal(back.origin + back.pathname, redirectUri);
  assert.equal(typeof back.searchParams.get("code"), "string");

  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as {
    apps: { clientId: string; clientName: string; origin?: string; logoUri?: string }[];
  };
  assert.deepEqual(
    listed.apps.map(({ clientId: id, clientName, origin, logoUri }) => ({ id, clientName, origin, logoUri })),
    [{ id: clientId, clientName: "Studio", origin: "https://app.example.test", logoUri: "https://app.example.test/logo.png" }],
  );
});

test("a logo the browser should not load is not shown", async () => {
  const { app, cookie } = await openRegistry();
  const redirectUri = "https://app.example.test/callback";
  const clientId = await registerApp(app, { client_name: "Studio", redirect_uris: [redirectUri], logo_uri: "http://tracker.example.test/pixel.gif" });
  await approveQuery(app, cookie, new URL(await authorizeLocation(app, cookie, clientId, redirectUri), publicUrl).search.slice(1));
  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as { apps: { logoUri?: string }[] };
  assert.equal(listed.apps[0]?.logoUri, undefined);
});

test("an app named by its metadata document is one client, and its own origin vouches for it", async () => {
  const documentUrl = "https://app.example.test/oauth-client.json";
  const fetched: string[] = [];
  const { app, cookie } = await openRegistry({
    fetchClientMetadataResource: (input) => {
      const url = input instanceof Request ? input.url : String(input);
      fetched.push(url);
      if (url !== documentUrl) return new Response(null, { status: 404 });
      return Response.json(
        {
          client_id: documentUrl,
          client_name: "Example",
          logo_uri: "https://app.example.test/logo.png",
          redirect_uris: ["https://app.example.test/callback"],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
        { headers: { "cache-control": "max-age=3600" } },
      );
    },
  });
  const prompted = new URL(await authorizeLocation(app, cookie, documentUrl, "https://app.example.test/callback"), publicUrl);
  assert.equal(prompted.pathname, "/consent");
  assert.deepEqual(fetched, [documentUrl]);
  const page = await (await app.request(`${publicUrl}/consent?${prompted.search.slice(1)}`, { headers: { cookie } })).text();
  assert.match(page, /Example<!-- --> wants to use agents on your devices/);
  assert.doesNotMatch(page, /Unverified/);
  await approveQuery(app, cookie, prompted.search.slice(1));

  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as { apps: { clientId: string; logoUri?: string }[] };
  assert.deepEqual(
    listed.apps.map((item) => ({ clientId: item.clientId, logoUri: item.logoUri })),
    [{ clientId: documentUrl, logoUri: "https://app.example.test/logo.png" }],
  );
});

test("an app on this computer is asked every time, and so is one that asks for consent", async () => {
  const { app, cookie } = await openRegistry();
  const local = "http://localhost:5173/callback";
  const localClient = await registerApp(app, { client_name: "Studio", redirect_uris: [local], application_type: "native" });
  await approveQuery(app, cookie, new URL(await authorizeLocation(app, cookie, localClient, local), publicUrl).search.slice(1));

  for (const prompt of [undefined, "none"]) {
    const asked = new URL(await authorizeLocation(app, cookie, localClient, local, prompt), publicUrl);
    assert.equal(asked.pathname, "/consent", `prompt=${prompt ?? "(none given)"}`);
    const page = await app.request(`${publicUrl}/consent?${asked.search.slice(1)}`, { headers: { cookie } });
    assert.equal(page.status, 200);
  }

  const remote = "https://notes.example.test/callback";
  const remoteClient = await registerApp(app, { client_name: "Notes", redirect_uris: [remote] });
  await approveQuery(app, cookie, new URL(await authorizeLocation(app, cookie, remoteClient, remote), publicUrl).search.slice(1));
  const forced = new URL(await authorizeLocation(app, cookie, remoteClient, remote, "consent"), publicUrl);
  assert.equal(forced.pathname, "/consent");
  const page = await app.request(`${publicUrl}/consent?${forced.search.slice(1)}`, { headers: { cookie } });
  assert.equal(page.status, 200);
});

test("registrations nobody approved are pruned, and approved ones are kept", async () => {
  const { app, cookie, exterior } = await openRegistry();
  const redirectUri = "https://dither.example.test/callback";
  const denied = await registerApp(app, { client_name: "Dither", redirect_uris: [redirectUri] });
  const query = new URL(await authorizeLocation(app, cookie, denied, redirectUri), publicUrl).search.slice(1);
  const answered = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "no", query }),
  });
  assert.equal(answered.status, 302);
  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as { apps: unknown[] };
  assert.deepEqual(listed.apps, []);

  const kept = await registerApp(app, { client_name: "Kept", redirect_uris: [redirectUri] });
  await approveQuery(app, cookie, new URL(await authorizeLocation(app, cookie, kept, redirectUri), publicUrl).search.slice(1));

  assert.equal(await prunePendingClients(exterior, 0), 1);
  assert.equal(await prunePendingClients(exterior, 0), 0);
  const back = new URL(await authorizeLocation(app, cookie, kept, redirectUri));
  assert.equal(typeof back.searchParams.get("code"), "string");
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


const publicApp = { grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };

/** Registers an app as `@exterior/client` does (RFC 7591) and returns its client id. */
async function registerApp(app: Hono<RelayEnv>, metadata: Record<string, unknown>): Promise<string> {
  const registered = await app.request(`${publicUrl}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...publicApp, ...metadata }),
  });
  assert.equal(registered.status, 201, await registered.clone().text());
  return ((await registered.json()) as { client_id: string }).client_id;
}

/** Authorizes the approval a consent page shows. */
async function approveQuery(app: Hono<RelayEnv>, cookie: string, query: string): Promise<void> {
  const approved = await app.request(`${publicUrl}/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accept: "yes", query }),
  });
  assert.equal(approved.status, 302);
  assert.match(approved.headers.get("location") ?? "", /[?&]code=/);
}

async function authorizeLocation(app: Hono<RelayEnv>, cookie: string, clientId: string, redirectUri: string, prompt?: string): Promise<string> {
  const authorize = new URL("/api/auth/oauth2/authorize", publicUrl);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "devices offline_access");
  authorize.searchParams.set("state", "browser-state");
  authorize.searchParams.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("resource", publicUrl);
  if (prompt) authorize.searchParams.set("prompt", prompt);
  const prompted = await app.request(authorize, { headers: { cookie } });
  assert.equal(prompted.status, 302, await prompted.clone().text());
  return prompted.headers.get("location") ?? "";
}

async function openRegistry(options: Pick<Parameters<typeof openExteriorAuth>[0], "fetchClientMetadataResource"> = {}) {
  const exterior: ExteriorAuth = await openExteriorAuth({
    database: new Database(":memory:"),
    secret,
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
    fetchClientMetadataResource: options.fetchClientMetadataResource,
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
