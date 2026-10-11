import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { Hono } from "hono";
import test from "node:test";
import { mountAccountPages } from "./account.js";
import type { RelayEnv } from "./app.js";
import { openMukaeAuth } from "./auth.js";

test("github sign-in sends the state cookie the callback checks", async () => {
  const publicUrl = "http://127.0.0.1:8787";
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
    origins: ["http://127.0.0.1:47100"],
  });
  const app = new Hono<RelayEnv>();
  mountAccountPages(app, mukae, true);
  app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));

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
