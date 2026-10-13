import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { test } from "vitest";
import { openExteriorAuth, type ExteriorAuth } from "./auth.js";
import { ensureDaemonClient, maxClientsPerUser, parseClientRegistration, registerClient } from "./clients.js";

async function openExterior(): Promise<ExteriorAuth> {
  return openExteriorAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl: "http://127.0.0.1:8787",
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
}

test("the daemon keeps the same client id", async () => {
  const exterior = await openExterior();
  const first = await ensureDaemonClient(exterior);
  const second = await ensureDaemonClient(exterior);
  assert.equal(first, second);
});

test("registration rejects reserved names and bad redirects", () => {
  const badName = parseClientRegistration({ clientName: "Exterior Pro", redirectUris: ["https://app.example.test/callback"], confidential: false });
  assert.equal(badName.ok, false);
  const fragment = parseClientRegistration({ clientName: "Studio", redirectUris: ["https://app.example.test/callback#x"], confidential: false });
  assert.equal(fragment.ok, false);
  const plainHttp = parseClientRegistration({ clientName: "Studio", redirectUris: ["http://app.example.test/callback"], confidential: false });
  assert.equal(plainHttp.ok, false);
  const loopback = parseClientRegistration({ clientName: "Studio", redirectUris: ["http://127.0.0.1:47100/oauth/callback"], confidential: false });
  assert.equal(loopback.ok, true);
});

test("a signed-in account registers a client and hits the per-account limit", async () => {
  const exterior = await openExterior();
  const owner = "owner-1";
  const first = await registerClient(exterior, owner, {
    clientName: "Studio",
    redirectUris: ["https://app.example.test/callback"],
    confidential: true,
  });
  assert.ok(first.clientId);
  assert.ok(first.clientSecret);
  const second = await registerClient(exterior, owner, {
    clientName: "Atelier",
    redirectUris: ["https://atelier.example.test/callback"],
    confidential: false,
  });
  assert.ok(second.clientId);
  assert.equal(second.clientSecret, undefined);
  assert.notEqual(first.clientId, second.clientId);
  for (let index = 2; index < maxClientsPerUser; index += 1) {
    await registerClient(exterior, owner, {
      clientName: `Extra ${index}`,
      redirectUris: [`https://extra-${index}.example.test/callback`],
      confidential: false,
    });
  }
  await assert.rejects(
    registerClient(exterior, owner, { clientName: "Overflow", redirectUris: ["https://overflow.example.test/callback"], confidential: false }),
    /at most/,
  );
});
