import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type ViteManifest = Record<string, { file: string }>;

export type WebAssets = {
  stylesheets: string[];
  dashboardScript?: string;
  devClient?: string;
};

export function readWebAssets(publicDir: string, devServerUrl?: string): WebAssets {
  if (devServerUrl) {
    return {
      stylesheets: [new URL("/styles.css", devServerUrl).href],
      dashboardScript: new URL("/main.tsx", devServerUrl).href,
      devClient: new URL("/@vite/client", devServerUrl).href,
    };
  }
  const path = join(publicDir, ".vite", "manifest.json");
  if (!existsSync(path)) return { stylesheets: [] };
  const manifest = JSON.parse(readFileSync(path, "utf8")) as ViteManifest;
  const stylesheet = manifest["styles.css"]?.file;
  const script = manifest["index.html"]?.file;
  return {
    stylesheets: stylesheet ? [`/${stylesheet}`] : [],
    dashboardScript: script ? `/${script}` : undefined,
  };
}
