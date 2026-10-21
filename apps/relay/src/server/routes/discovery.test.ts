import assert from "node:assert/strict";
import { protectedResourcePath } from "@exterioragentprotocol/sdk";
import Database from "better-sqlite3";
import { test } from "vitest";
import { openExteriorAuth } from "../identity/auth.js";
import { createTestApp } from "../testing.js";

test("the relay names its authorization server, which lists sign-in, registration and device sign-in", async () => {
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl: "http://127.0.0.1:8787",
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  const { app } = await createTestApp(exterior);
  const resource = (await (await app.request(`http://127.0.0.1:8787${protectedResourcePath}`)).json()) as { authorization_servers: string[] };
  assert.deepEqual(resource.authorization_servers, ["http://127.0.0.1:8787/api/auth"]);
  const discovery = await app.request(`${resource.authorization_servers[0]}/.well-known/openid-configuration`);
  assert.equal(discovery.status, 200);
  const metadata = (await discovery.json()) as { issuer?: string; authorization_endpoint?: string; registration_endpoint?: string; device_authorization_endpoint?: string };
  assert.equal(metadata.issuer, "http://127.0.0.1:8787/api/auth");
  assert.equal(metadata.authorization_endpoint, "http://127.0.0.1:8787/api/auth/oauth2/authorize");
  assert.equal(metadata.registration_endpoint, "http://127.0.0.1:8787/api/auth/oauth2/register");
  assert.equal(metadata.device_authorization_endpoint, "http://127.0.0.1:8787/api/auth/device/code");
});
