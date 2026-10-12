import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, test } from "vitest";
import { readWebAssets } from "./assets.js";
import { createPageRenderer } from "./render-page.js";

const publicDir = mkdtempSync(join(tmpdir(), "mukae-web-"));
mkdirSync(join(publicDir, ".vite"));
writeFileSync(join(publicDir, ".vite", "manifest.json"), JSON.stringify({
  "index.html": { file: "assets/dashboard-abc.js" },
  "styles.css": { file: "assets/styles-abc.css" },
}));
afterAll(() => {
  unlinkSync(join(publicDir, ".vite", "manifest.json"));
  rmdirSync(join(publicDir, ".vite"));
  rmdirSync(publicDir);
});

test("all pages use the shared stylesheet and only the dashboard loads browser code", () => {
  const render = createPageRenderer(readWebAssets(publicDir));
  const account = render.account({ kind: "sign-in", query: "", configured: true });
  const dashboard = render.dashboard({ userName: "Ada", machines: [], sessions: [] });
  for (const html of [account, dashboard]) assert.match(html, /href="\/assets\/styles-abc\.css"/);
  assert.doesNotMatch(account, /dashboard-abc\.js/);
  assert.match(dashboard, /src="\/assets\/dashboard-abc\.js"/);
});

test("account forms render without browser JavaScript and escape approval data", () => {
  const render = createPageRenderer({ stylesheets: [] });
  const query = 'client_id=studio&state="><script>alert(1)</script>';
  const html = render.account({ kind: "consent", query, clientId: "studio", clientName: "<script>studio</script>", redirectUri: "", scope: "machines" });
  assert.match(html, /<form(?=[^>]*method="post")(?=[^>]*action="\/consent")[^>]*>/);
  assert.match(html, /<button(?=[^>]*name="accept")(?=[^>]*value="yes")[^>]*>/);
  assert.match(html, /<button(?=[^>]*name="accept")(?=[^>]*value="no")[^>]*>/);
  assert.match(html, /&lt;script&gt;studio&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /name="query"/);
});

test("the dashboard escapes embedded props", () => {
  const html = createPageRenderer({ stylesheets: [] }).dashboard({ userName: '</script><script>alert("x")</script>', machines: [], sessions: [] });
  assert.match(html, /id="props"/);
  assert.doesNotMatch(html, /<\/script><script>/);
});

test("account pages keep rendering without a web build", () => {
  const render = createPageRenderer(readWebAssets(join(publicDir, "missing")));
  const html = render.account({ kind: "device-code" });
  assert.match(html, /name="user_code"/);
  assert.match(html, /<form(?=[^>]*method="get")(?=[^>]*action="\/device")[^>]*>/);
});

test("development pages use Vite assets without a production manifest", () => {
  const render = createPageRenderer(readWebAssets(join(publicDir, "missing"), "http://127.0.0.1:47102"));
  const html = render.dashboard({ userName: "Ada", machines: [], sessions: [] });
  assert.match(html, /href="http:\/\/127.0.0.1:47102\/styles.css"/);
  assert.match(html, /src="http:\/\/127.0.0.1:47102\/main.tsx"/);
  assert.match(html, /src="http:\/\/127.0.0.1:47102\/@vite\/client"/);
});
