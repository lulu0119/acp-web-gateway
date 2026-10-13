import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, test } from "vitest";
import { readWebAssets } from "./assets.js";
import { createPageRenderer } from "./render-page.js";

const publicDir = mkdtempSync(join(tmpdir(), "exterior-web-"));
mkdirSync(join(publicDir, ".vite"));
writeFileSync(join(publicDir, ".vite", "manifest.json"), JSON.stringify({
  "index.html": { file: "assets/dashboard-abc.js" },
  "account-main.tsx": { file: "assets/account-abc.js" },
  "styles.css": { file: "assets/styles-abc.css" },
}));
afterAll(() => {
  unlinkSync(join(publicDir, ".vite", "manifest.json"));
  rmdirSync(join(publicDir, ".vite"));
  rmdirSync(publicDir);
});

const guide = { relayUrl: "http://127.0.0.1:8787", prompt: { code: "", html: "" }, commands: { code: "", html: "" }, afterLogin: { code: "", html: "" } };
const permissions = [{ scope: "machines", title: "Use agents on your devices", detail: "" }];

test("all pages use the shared stylesheet and each loads only its own script", () => {
  const render = createPageRenderer(readWebAssets(publicDir));
  const account = render.account({ kind: "sign-in", query: "", configured: true });
  const dashboard = render.dashboard({ userName: "Ada", devices: [], sessions: [] }, guide);
  for (const html of [account, dashboard]) assert.match(html, /href="\/assets\/styles-abc\.css"/);
  assert.doesNotMatch(account, /dashboard-abc\.js/);
  assert.match(account, /src="\/assets\/account-abc\.js"/);
  assert.match(dashboard, /src="\/assets\/dashboard-abc\.js"/);
  assert.doesNotMatch(dashboard, /account-abc\.js/);
});

test("account forms render on the server and escape approval data", () => {
  const render = createPageRenderer({ stylesheets: [] });
  const query = 'client_id=studio&state="><script>alert(1)</script>';
  const html = render.account({
    kind: "consent",
    query,
    clientId: "studio",
    clientName: "<script>studio</script>",
    origin: "https://studio.example.test",
    redirectUri: "https://studio.example.test/callback",
    unverified: true,
    account: { name: "Ada" },
    permissions,
  });
  assert.match(html, /<form(?=[^>]*method="post")(?=[^>]*action="\/consent")[^>]*>/);
  assert.match(html, /<input(?=[^>]*name="accept")(?=[^>]*value="yes")[^>]*>/);
  assert.match(html, /<input(?=[^>]*name="accept")(?=[^>]*value="no")[^>]*>/);
  assert.match(html, /<button(?=[^>]*type="submit")[^>]*>[\s\S]*Authorize/);
  assert.match(html, /&lt;script&gt;studio&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /https:\/\/studio\.example\.test/);
  assert.match(html, /Unverified/);
  assert.match(html, /name="query"/);
});

test("account pages show the signed-in person's avatar, or their initial without one", () => {
  const render = createPageRenderer({ stylesheets: [] });
  const withImage = render.account({ kind: "device", userCode: "ABCDEFGH", account: { name: "Ada", image: "https://avatars.example.test/ada.png" } });
  assert.match(withImage, /<img[^>]*src="https:\/\/avatars\.example\.test\/ada\.png"[^>]*referrerPolicy="no-referrer"|<img[^>]*referrerPolicy="no-referrer"[^>]*src="https:\/\/avatars\.example\.test\/ada\.png"/i);
  const withoutImage = render.account({ kind: "device", userCode: "ABCDEFGH", account: { name: "Ada" } });
  assert.doesNotMatch(withoutImage, /<img/);
  assert.match(withoutImage, />A</);
});

test("the dashboard escapes embedded props", () => {
  const html = createPageRenderer({ stylesheets: [] }).dashboard({ userName: '</script><script>alert("x")</script>', devices: [], sessions: [] }, guide);
  assert.match(html, /id="props"/);
  assert.doesNotMatch(html, /<\/script><script>/);
});

test("account pages keep rendering without a web build", () => {
  const render = createPageRenderer(readWebAssets(join(publicDir, "missing")));
  const html = render.account({ kind: "device-code", account: { name: "Ada" } });
  assert.match(html, /name="user_code"/);
  assert.match(html, /<form(?=[^>]*method="get")(?=[^>]*action="\/device")[^>]*>/);
});

test("development pages use Vite assets without a production manifest", () => {
  const render = createPageRenderer(readWebAssets(join(publicDir, "missing"), "http://127.0.0.1:47102"));
  const html = render.dashboard({ userName: "Ada", devices: [], sessions: [] }, guide);
  assert.match(html, /href="http:\/\/127.0.0.1:47102\/styles.css"/);
  assert.match(html, /src="http:\/\/127.0.0.1:47102\/main.tsx"/);
  assert.match(html, /src="http:\/\/127.0.0.1:47102\/@vite\/client"/);
  const account = render.account({ kind: "sign-in", query: "", configured: true });
  assert.match(account, /src="http:\/\/127.0.0.1:47102\/account-main.tsx"/);
});
