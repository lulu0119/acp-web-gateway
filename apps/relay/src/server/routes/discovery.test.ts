import assert from "node:assert/strict";
import { devicesScope } from "@exterioragentprotocol/sdk";
import Database from "better-sqlite3";
import { test } from "vitest";
import { openExteriorAuth } from "../identity/auth.js";
import { ensureDaemonClient } from "../identity/clients.js";
import { createTestApp } from "../testing.js";

test("discovery lists sign-in and device sign-in", async () => {
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl: "http://127.0.0.1:8787",
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const daemonClientId = await ensureDaemonClient(exterior);
  const { app } = await createTestApp(exterior);
  const discovery = await app.request("http://127.0.0.1:8787/api/auth/.well-known/openid-configuration");
  assert.equal(discovery.status, 200);
  const metadata = (await discovery.json()) as { issuer?: string; authorization_endpoint?: string; device_authorization_endpoint?: string };
  assert.equal(metadata.issuer, "http://127.0.0.1:8787/api/auth");
  assert.equal(metadata.authorization_endpoint, "http://127.0.0.1:8787/api/auth/oauth2/authorize");
  assert.equal(metadata.device_authorization_endpoint, "http://127.0.0.1:8787/api/auth/device/code");

  const device = await app.request("http://127.0.0.1:8787/api/auth/device/code", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: daemonClientId, scope: devicesScope, resource: "http://127.0.0.1:8787" }),
  });
  assert.equal(device.status, 200);
  const body = (await device.json()) as { user_code?: string; verification_uri?: string };
  assert.equal(typeof body.user_code, "string");
  assert.match(body.verification_uri ?? "", /\/device/);
});
