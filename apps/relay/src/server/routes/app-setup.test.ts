import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appSetupPath, appSetupResultPath, clientRegistryPath } from "@exterior/contract";
import { test, vi } from "vitest";
import { openSignedInRelay, sessionCookie } from "../testing.js";

const clientName = "AUV Playground Dev";
const redirectUri = "http://127.0.0.1:5180/playground/oauth/callback";

function setupUrl(setupId: string): string {
  return `${appSetupPath}?${new URLSearchParams({ setup_id: setupId, client_name: clientName, redirect_uri: redirectUri })}`;
}

function approval(html: string): string {
  const token = /name="approval" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(token, "the approval page carries the relay's signed request");
  return token;
}

test("an assistant registers a local app after account approval, polls for it, and can repeat setup without a new client", async () => {
  const { app, cookie } = await openSignedInRelay();
  const setupId = randomUUID();
  const poll = (id: string = setupId) => app.request(`${appSetupResultPath}/${id}`);
  assert.equal((await poll()).status, 202);
  assert.equal((await poll("short")).status, 400);
  const start = await app.request(setupUrl(setupId));
  assert.equal(start.status, 302);
  const signIn = start.headers.get("location")!;
  const signedOut = await app.request(signIn);
  assert.match(await signedOut.text(), /name="query" value="next=/);
  const signedIn = await app.request(signIn, { headers: { cookie } });
  assert.equal(signedIn.headers.get("location"), setupUrl(setupId));

  const page = await app.request(setupUrl(setupId), { headers: { cookie } });
  const html = await page.text();
  assert.match(html.replace(/<!-- -->/g, ""), /Register AUV Playground Dev\?/);
  assert.match(html, /Access to your devices is requested separately/);
  const decide = (token: string, decision = "register") => app.request(clientRegistryPath, {
    method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ approval: token, decision }),
  });
  const token = approval(html);
  const lostLogin = await app.request(clientRegistryPath, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ approval: token, decision: "register" }) });
  assert.equal(lostLogin.status, 302);
  assert.equal(new URL(lostLogin.headers.get("location")!, "http://127.0.0.1:8787").searchParams.get("next"), setupUrl(setupId));
  const accepted = await Promise.all([decide(token), decide(token)]);
  for (const response of accepted) assert.equal(response.status, 200, await response.clone().text());
  const result = await (await poll()).json() as { status: string; clientId: string; clientName: string; redirectUri: string };
  assert.equal(result.status, "registered");
  assert.ok(result.clientId);
  assert.equal(result.clientName, clientName);
  assert.equal(result.redirectUri, redirectUri);
  assert.equal((await poll(randomUUID())).status, 202);
  assert.deepEqual(await (await app.request("/api/grants", { headers: { cookie } })).json(), { apps: [] });

  const again = randomUUID();
  const againPage = await app.request(setupUrl(again), { headers: { cookie } });
  assert.equal((await decide(approval(await againPage.text()))).status, 200);
  const repeated = await (await poll(again)).json() as { clientId: string };
  assert.equal(repeated.clientId, result.clientId);
});

test("registration decisions are signed, bound to the account, expiring, and cancellation reaches the assistant", async () => {
  const { app, exterior, cookie } = await openSignedInRelay();
  const setupId = randomUUID();
  const page = await app.request(setupUrl(setupId), { headers: { cookie } });
  const token = approval(await page.text());
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Grace", email: "grace@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  const otherCookie = await sessionCookie(session.token);
  const decide = (requestToken: string, accountCookie = cookie, decision = "register") => app.request(clientRegistryPath, {
    method: "POST", headers: { cookie: accountCookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ approval: requestToken, decision }),
  });
  assert.equal((await decide(token, otherCookie)).status, 400);
  assert.equal((await decide(`x${token}`)).status, 400);
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(Date.now() + 11 * 60_000);
    assert.equal((await decide(token)).status, 400);
  } finally {
    vi.useRealTimers();
  }
  assert.equal((await decide(token, cookie, "deny")).status, 200);
  const poll = await app.request(`${appSetupResultPath}/${setupId}`);
  assert.deepEqual(await poll.json(), { status: "denied" });
  assert.equal((await app.request(setupUrl(setupId).replace("http%3A%2F%2F127.0.0.1%3A5180", "http%3A%2F%2Fremote.example"))).status, 400);
});

test("a sign-in continuation cannot leave the relay", async () => {
  const { app, cookie } = await openSignedInRelay();
  const response = await app.request(`/sign-in?next=${encodeURIComponent("/\\evil.example/path")}`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Continue with GitHub/);
});
