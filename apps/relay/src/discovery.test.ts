import assert from "node:assert/strict";
import { machinesScope } from "@mukae/contract";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { test } from "vitest";
import { openMukaeAuth } from "./auth.js";
import { ensureDaemonClient } from "./clients.js";

test("discovery lists sign-in and device sign-in", async () => {
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl: "http://127.0.0.1:8787",
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
    origins: ["http://127.0.0.1:47100"],
  });
  const daemonClientId = await ensureDaemonClient(mukae);
  const app = new Hono();
  app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));
  const discovery = await app.request("http://127.0.0.1:8787/api/auth/.well-known/openid-configuration");
  assert.equal(discovery.status, 200);
  const metadata = (await discovery.json()) as { issuer?: string; authorization_endpoint?: string; device_authorization_endpoint?: string };
  assert.equal(metadata.issuer, "http://127.0.0.1:8787/api/auth");
  assert.equal(metadata.authorization_endpoint, "http://127.0.0.1:8787/api/auth/oauth2/authorize");
  assert.equal(metadata.device_authorization_endpoint, "http://127.0.0.1:8787/api/auth/device/code");

  const device = await app.request("http://127.0.0.1:8787/api/auth/device/code", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: daemonClientId, scope: machinesScope, resource: "http://127.0.0.1:8787" }),
  });
  assert.equal(device.status, 200);
  const body = (await device.json()) as { user_code?: string; verification_uri?: string };
  assert.equal(typeof body.user_code, "string");
  assert.match(body.verification_uri ?? "", /\/device/);
});
