import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { Hono } from "hono";
import test from "node:test";
import type { RelayEnv } from "./app.js";
import { openMukaeAuth } from "./auth.js";
import { mountDashboard } from "./dashboard.js";
import { createRegistry } from "./registry.js";

test("the dashboard asks a signed-out account to sign in", async () => {
  const { app } = await openDashboard();
  const home = await app.request("http://127.0.0.1:8787/");
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("location"), "/sign-in?next=%2F");
  const data = await app.request("http://127.0.0.1:8787/api/dashboard");
  assert.equal(data.status, 401);
});

test("a signed-in account sees its own machines and connections", async () => {
  const { app, cookie, registry, userId } = await openDashboard();
  const daemon = registry.connectDaemon({ userId, send: () => undefined });
  daemon.receive({ type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] });
  const machineId = registry.listMachines(userId)[0]?.id ?? "";

  const home = await app.request("http://127.0.0.1:8787/", { headers: { cookie } });
  assert.equal(home.status, 200);
  const text = await home.text();
  assert.match(text, /id="props"/);
  assert.match(text, new RegExp(machineId));

  const data = await app.request("http://127.0.0.1:8787/api/dashboard", { headers: { cookie } });
  assert.equal(data.status, 200);
  const body = (await data.json()) as { userName: string; machines: unknown[]; sessions: unknown[] };
  assert.equal(body.userName, "Ada");
  assert.equal(body.machines.length, 1);
  assert.deepEqual(body.sessions, []);
  daemon.close();
});

test("signing out ends the cookie session", async () => {
  const { app, cookie } = await openDashboard();
  const signedOut = await app.request("http://127.0.0.1:8787/api/auth/sign-out", {
    method: "POST",
    headers: { cookie, origin: "http://127.0.0.1:8787", "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(signedOut.status, 200);
  const home = await app.request("http://127.0.0.1:8787/", { headers: { cookie } });
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("location"), "/sign-in?next=%2F");
});

async function openDashboard() {
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
  const context = await mukae.auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: "Ada", email: "ada@example.test", emailVerified: true },
    { method: "test" },
  );
  const created = await context.internalAdapter.createSession(user.id);
  const registry = createRegistry();
  const app = new Hono<RelayEnv>();
  mountDashboard(app, mukae, registry);
  app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));
  return { app, registry, userId: user.id, cookie: await sessionCookie(created.token, secret) };
}

async function sessionCookie(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `better-auth.session_token=${token}.${encoded}`;
}
