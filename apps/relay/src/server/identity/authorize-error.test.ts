import assert from "node:assert/strict";
import { test } from "vitest";
import { readBrowserAuthorizeError } from "./authorize-error.js";

const url = "https://relay.example.test/api/auth/oauth2/authorize?client_id=studio&state=keep-me";
const browser = new Request(url, { headers: { accept: "text/html" } });

test("an authorization failure keeps diagnostics behind the shared message page", async () => {
  const response = Response.json({ error: "invalid_client", error_description: "Metadata document is not valid JSON" }, { status: 400 });
  const page = await readBrowserAuthorizeError(browser, response);
  assert.equal(page?.kind, "message");
  if (page?.kind !== "message") return;
  assert.equal(page.action, undefined);
  assert.match(page.message, /Go back to the app/);
  assert.equal(page.details, "invalid_client: Metadata document is not valid JSON");
  assert.equal((await response.json()).error, "invalid_client");
});

test("temporary authorization errors can retry the original request", async () => {
  const page = await readBrowserAuthorizeError(browser, Response.json({ error: "temporarily_unavailable" }, { status: 503 }));
  assert.equal(page?.kind, "message");
  if (page?.kind !== "message") return;
  assert.equal(page.action?.href, "/api/auth/oauth2/authorize?client_id=studio&state=keep-me");
  assert.match(page.message, /Try again/);
});

test("rate limiting uses the same page even without an OAuth error code", async () => {
  const page = await readBrowserAuthorizeError(browser, Response.json({ message: "Too many requests. Please try again later." }, { status: 429 }));
  assert.equal(page?.kind, "message");
  if (page?.kind !== "message") return;
  assert.equal(page.title, "Too many sign-in attempts");
  assert.match(page.message, /Wait/);
  assert.equal(page.action?.label, "Try again");
});

test("only an HTML authorization navigation gets an error page", async () => {
  const failure = () => Response.json({ error: "invalid_client" }, { status: 400 });
  for (const request of [
    new Request(url, { headers: { accept: "application/json" } }),
    new Request(url, { headers: { accept: "text/html;q=0, application/json" } }),
    new Request(url, { method: "POST", headers: { accept: "text/html" } }),
    new Request("https://relay.example.test/api/auth/oauth2/token", { headers: { accept: "text/html" } }),
  ]) assert.equal(await readBrowserAuthorizeError(request, failure()), undefined);
  assert.equal(await readBrowserAuthorizeError(browser, new Response("broken", { status: 500, headers: { "content-type": "application/json" } })), undefined);
  assert.equal(await readBrowserAuthorizeError(browser, Response.json({ error: "invalid_client" })), undefined);
});
