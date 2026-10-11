import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { openMukaeAuth } from "./auth.js";
import { ensurePublicClients } from "./clients.js";

test("the example and the daemon keep the same client ids", async () => {
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl: "http://127.0.0.1:8787",
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
    origins: ["http://127.0.0.1:47100"],
  });
  const redirectUri = "http://127.0.0.1:47100/oauth/callback";
  const first = await ensurePublicClients(mukae, { redirectUri });
  const second = await ensurePublicClients(mukae, { redirectUri });
  assert.equal(first.exampleClientId, second.exampleClientId);
  assert.equal(first.daemonClientId, second.daemonClientId);
  assert.notEqual(first.exampleClientId, first.daemonClientId);
});
