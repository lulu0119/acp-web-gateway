import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DashboardData } from "./dashboard-data.js";

type ViteManifest = Record<string, { file: string; css?: string[] }>;

function readManifest(publicDir: string): ViteManifest | undefined {
  const path = join(publicDir, ".vite", "manifest.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ViteManifest;
  } catch {
    return undefined;
  }
}

function dashboardEntry(publicDir: string): { file: string; css: string[] } | undefined {
  const entry = readManifest(publicDir)?.["dashboard.html"];
  if (!entry) return undefined;
  return { file: entry.file, css: entry.css ?? [] };
}

export function webStylesheet(publicDir = "dist/public"): string {
  const css = dashboardEntry(publicDir)?.css ?? [];
  return css.map((file) => `<link rel="stylesheet" href="/${file}">`).join("");
}

export function dashboardShell(data: DashboardData, publicDir = "dist/public"): string {
  const entry = dashboardEntry(publicDir);
  const css = (entry?.css ?? []).map((file) => `<link rel="stylesheet" href="/${file}">`).join("");
  const script = entry ? `<script type="module" src="/${entry.file}"></script>` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mukae</title>${css}
</head>
<body>
  <div id="root"></div>
  <script id="props" type="application/json">${escapeJson(data)}</script>${script}
</body>
</html>`;
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
