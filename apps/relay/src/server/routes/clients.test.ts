import assert from "node:assert/strict";
import Database from "better-sqlite3";
import type { Hono } from "hono";
import { test, vi } from "vitest";
import type { RelayEnv } from "../http.js";
import { exampleClient } from "@exterior/contract";
import { openExteriorAuth, type ExteriorAuth } from "../identity/auth.js";
import { createTestApp } from "../testing.js";

const publicUrl = "http://127.0.0.1:8787";
const secret = "test-secret-test-secret-test-secret";

test("an app names itself by a metadata document, or by a client an account registered, never by registering anonymously", async () => {
  const { app } = await openRegistry();
  const metadata = (await (await app.request(`${publicUrl}/api/auth/.well-known/openid-configuration`)).json()) as Record<string, unknown>;
  assert.equal(metadata.client_id_metadata_document_supported, true);
  assert.equal(metadata.registration_endpoint, undefined);
  const anonymous = await app.request(`${publicUrl}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Studio", redirect_uris: ["https://app.example.test/callback"], grant_types: ["authorization_code"], token_endpoint_auth_method: "none" }),
  });
  assert.ok(anonymous.status >= 400 && anonymous.status < 500, `HTTP ${anonymous.status}`);
  const gated = await app.request(`${publicUrl}/api/clients/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientName: "Studio", redirectUris: ["https://app.example.test/callback"], confidential: false }),
  });
  assert.equal(gated.status, 401);
});

test("a registered app approved once comes straight back, and is one authorized app", async () => {
  const { app, cookie } = await openRegistry();
  const redirectUri = "https://app.example.test/callback";
  const clientId = await registerApp(app, cookie, { clientName: "Studio", redirectUris: [redirectUri], logoUri: "https://app.example.test/logo.png" });

  const consent = new URL(await authorizeLocation(app, cookie, clientId, redirectUri), publicUrl);
  assert.equal(consent.pathname, "/consent");
  const page = await (await app.request(`${publicUrl}/consent?${consent.search.slice(1)}`, { headers: { cookie } })).text();
  assert.match(page, /Studio/);
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
  const documentUrl = "https://app.example.test/oauth-client.json";
  const redirectUri = "https://app.example.test/callback";
  const { app, cookie } = await openRegistry({
    fetchClientMetadataResource: () => Response.json({
      client_id: documentUrl,
      client_name: "Studio",
      logo_uri: "http://tracker.example.test/pixel.gif",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  await approveQuery(app, cookie, new URL(await authorizeLocation(app, cookie, documentUrl, redirectUri), publicUrl).search.slice(1));
  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as { apps: { logoUri?: string }[] };
  assert.equal(listed.apps[0]?.logoUri, undefined);
});

test("an app named by its metadata document is one client, shown with the origin it returns to", async () => {
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
  assert.match(page, />https:\/\/app\.example\.test</);
  await approveQuery(app, cookie, prompted.search.slice(1));

  const listed = (await (await app.request(`${publicUrl}/api/grants`, { headers: { cookie } })).json()) as { apps: { clientId: string; logoUri?: string }[] };
  assert.deepEqual(
    listed.apps.map((item) => ({ clientId: item.clientId, logoUri: item.logoUri })),
    [{ clientId: documentUrl, logoUri: "https://app.example.test/logo.png" }],
  );
});

test("a development copy of Example signs in as Example through its loopback redirect, on any port, with a warning that it runs on this computer", async () => {
  const fetched: string[] = [];
  const { app, cookie } = await openRegistry({
    fetchClientMetadataResource: (input) => {
      fetched.push(input instanceof Request ? input.url : String(input));
      return new Response(null, { status: 404 });
    },
  });
  const local = "http://localhost:5199/oauth/callback";
  const prompted = new URL(await authorizeLocation(app, cookie, exampleClient.client_id, local), publicUrl);
  assert.equal(prompted.pathname, "/consent");
  assert.deepEqual(fetched, []);
  const page = await (await app.request(`${publicUrl}/consent?${prompted.search.slice(1)}`, { headers: { cookie } })).text();
  assert.match(page, /Example<!-- --> wants to use agents on your devices/);
  assert.match(page, /This app runs on your computer/);
  await approveQuery(app, cookie, prompted.search.slice(1));
});

test("a browser sees a page when the app's description cannot be downloaded", async () => {
  const documentUrl = "https://app.example.test/oauth-client.json";
  const { app } = await openRegistry({
    fetchClientMetadataResource: () => {
      throw new Error("offline");
    },
  });
  const authorize = authorizeRequest(documentUrl);
  const shown = await app.request(authorize, { headers: { accept: "text/html" } });
  assert.equal(shown.status, 400);
  assert.match(shown.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(shown.headers.get("x-frame-options"), "DENY");
  const page = await shown.text();
  assert.match(page, /Exterior could not reach this app/);
  assert.match(page, /The app's description could not be downloaded/);
  assert.match(page, /Try again/);
  assert.match(page, /<details[^>]*>[\s\S]*invalid_client:[\s\S]*<\/details>/);
  assert.doesNotMatch(page, /<details[^>]*\bopen\b/);

  const { app: rawApp } = await openRegistry({
    fetchClientMetadataResource: () => {
      throw new Error("offline");
    },
  });
  const raw = await rawApp.request(authorize, { headers: { accept: "application/json" } });
  assert.equal(raw.status, 400);
  assert.match(raw.headers.get("content-type") ?? "", /json/);
  assert.equal(((await raw.json()) as { error: string }).error, "invalid_client");
});

test("a browser sees that the app's description did not download in time", async () => {
  const documentUrl = "https://app.example.test/oauth-client.json";
  const { app } = await openRegistry({
    fetchClientMetadataResource: (_input, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException("The operation was aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    }),
  });
  const shown = await app.request(authorizeRequest(documentUrl), { headers: { accept: "text/html" } });
  assert.equal(shown.status, 400);
  const page = await shown.text();
  assert.match(page, /did not download in time/);
  assert.match(page, new RegExp(`href="${authorizeRequest(documentUrl).pathname}\\?[^"]*oauth-client\\.json`));
  assert.match(page, /<details[^>]*>[\s\S]*5000ms[\s\S]*<\/details>/);
}, 15_000);

test("invalid app metadata explains how to restart without a retry loop", async () => {
  const { app } = await openRegistry({
    fetchClientMetadataResource: () => new Response("not JSON", { headers: { "content-type": "application/json" } }),
  });
  const shown = await app.request(authorizeRequest("https://app.example.test/oauth-client.json"), { headers: { accept: "text/html" } });
  assert.equal(shown.status, 400);
  const page = await shown.text();
  assert.match(page, /This sign-in could not start/);
  assert.match(page, /Go back to the app/);
  assert.match(page, /Metadata document is not valid JSON/);
  assert.doesNotMatch(page, />Try again</);
});

test("an authorization error page preserves the server status and response headers", async () => {
  const { app, exterior } = await openRegistry();
  vi.spyOn(exterior.auth, "handler").mockResolvedValueOnce(Response.json({ error: "temporarily_unavailable" }, {
    status: 503,
    headers: { "retry-after": "30", "set-cookie": "flow=continue; HttpOnly", "content-length": "1" },
  }));
  const shown = await app.request(authorizeRequest("studio"), { headers: { accept: "text/html" } });
  assert.equal(shown.status, 503);
  assert.equal(shown.headers.get("retry-after"), "30");
  assert.match(shown.headers.get("set-cookie") ?? "", /flow=continue/);
  assert.equal(shown.headers.get("content-length"), null);
  assert.equal(shown.headers.get("cache-control"), "no-store");
  assert.equal(shown.headers.get("content-security-policy"), "frame-ancestors 'none'");
  assert.match(await shown.text(), /Sign-in is temporarily unavailable/);
});

test("an unexpected authorization failure shows browsers a page and API callers JSON", async () => {
  const { app, exterior } = await openRegistry();
  app.post("/fixture-failure", () => { throw new Error("fixture form failure"); });
  vi.spyOn(exterior.auth, "handler").mockRejectedValue(new Error("fixture authorization failure"));
  for (const accept of ["text/html", "application/json"]) {
    const shown = await app.request(authorizeRequest("studio"), { headers: { accept } });
    assert.equal(shown.status, 500);
    if (accept === "text/html") {
      assert.match(shown.headers.get("content-type") ?? "", /text\/html/);
      assert.equal(shown.headers.get("x-frame-options"), "DENY");
      const page = await shown.text();
      assert.match(page, /Something went wrong/);
      assert.match(page, />Try again</);
      assert.doesNotMatch(page, /fixture authorization failure/);
    } else {
      assert.deepEqual(await shown.json(), { message: "Exterior hit an error. Try again." });
    }
  }
  const failedPost = await app.request(`${publicUrl}/fixture-failure`, { method: "POST" });
  assert.equal(failedPost.status, 500);
  const page = await failedPost.text();
  assert.match(page, /Start again from the app or your device/);
  assert.doesNotMatch(page, />Try again</);
});

test("an app on this computer is asked every time, and so is one that asks for consent", async () => {
  const { app, cookie } = await openRegistry();
  const local = "http://localhost:5173/callback";
  const localClient = await registerApp(app, cookie, { clientName: "Studio", redirectUris: [local] });
  await approveQuery(app, cookie, new URL(await authorizeLocation(app, cookie, localClient, local), publicUrl).search.slice(1));

  for (const prompt of [undefined, "none"]) {
    const asked = new URL(await authorizeLocation(app, cookie, localClient, local, prompt), publicUrl);
    assert.equal(asked.pathname, "/consent", `prompt=${prompt ?? "(none given)"}`);
    const page = await app.request(`${publicUrl}/consent?${asked.search.slice(1)}`, { headers: { cookie } });
    assert.equal(page.status, 200);
  }

  const remote = "https://notes.example.test/callback";
  const remoteClient = await registerApp(app, cookie, { clientName: "Notes", redirectUris: [remote] });
  await approveQuery(app, cookie, new URL(await authorizeLocation(app, cookie, remoteClient, remote), publicUrl).search.slice(1));
  const forced = new URL(await authorizeLocation(app, cookie, remoteClient, remote, "consent"), publicUrl);
  assert.equal(forced.pathname, "/consent");
  const page = await app.request(`${publicUrl}/consent?${forced.search.slice(1)}`, { headers: { cookie } });
  assert.equal(page.status, 200);
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

/** Registers a public app for the signed-in account, as the dashboard does, and returns its client id. */
async function registerApp(app: Hono<RelayEnv>, cookie: string, input: { clientName: string; redirectUris: string[]; logoUri?: string }): Promise<string> {
  const registered = await app.request(`${publicUrl}/api/clients/register`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ...input, confidential: false }),
  });
  assert.equal(registered.status, 201, await registered.clone().text());
  return ((await registered.json()) as { clientId: string }).clientId;
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

function authorizeRequest(clientId: string): URL {
  const authorize = new URL("/api/auth/oauth2/authorize", publicUrl);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", "https://app.example.test/callback");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "eap:client offline_access");
  authorize.searchParams.set("state", "browser-state");
  authorize.searchParams.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("resource", publicUrl);
  return authorize;
}

async function authorizeLocation(app: Hono<RelayEnv>, cookie: string, clientId: string, redirectUri: string, prompt?: string): Promise<string> {
  const authorize = authorizeRequest(clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
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
