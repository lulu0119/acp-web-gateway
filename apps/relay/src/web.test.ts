import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardShell, webStylesheet } from "./web.js";

const publicDir = join(tmpdir(), `mukae-web-${process.pid}`);
mkdirSync(join(publicDir, ".vite"), { recursive: true });
writeFileSync(
  join(publicDir, ".vite", "manifest.json"),
  JSON.stringify({ "dashboard.html": { file: "assets/dashboard-abc.js", css: ["assets/dashboard-abc.css"] } }),
);

test("the dashboard shell points at the built bundle and escapes props", () => {
  const html = dashboardShell(
    { userName: '</script><script>alert("x")</script>', machines: [], sessions: [] },
    publicDir,
  );
  assert.match(html, /src="\/assets\/dashboard-abc\.js"/);
  assert.match(html, /href="\/assets\/dashboard-abc\.css"/);
  assert.doesNotMatch(html, /<\/script><script>/);
});

test("server pages keep working without a web build", () => {
  const missing = join(tmpdir(), "mukae-web-missing");
  assert.equal(webStylesheet(missing), "");
  const html = dashboardShell({ userName: "Ada", machines: [], sessions: [] }, missing);
  assert.match(html, /id="props"/);
});
