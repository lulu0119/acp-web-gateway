import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type ViteManifest = Record<string, { file: string }>;

export type WebAssets = {
  stylesheets: string[];
  dashboardScript?: string;
  accountScript?: string;
  devClient?: string;
};

export function readWebAssets(publicDir: string, devServerUrl?: string): WebAssets {
  if (devServerUrl) {
    return {
      stylesheets: [new URL("/styles.css", devServerUrl).href],
      dashboardScript: new URL("/main.tsx", devServerUrl).href,
      accountScript: new URL("/account-main.tsx", devServerUrl).href,
      devClient: new URL("/@vite/client", devServerUrl).href,
    };
  }
  const path = join(publicDir, ".vite", "manifest.json");
  if (!existsSync(path)) return { stylesheets: [] };
  const manifest = JSON.parse(readFileSync(path, "utf8")) as ViteManifest;
  const stylesheet = manifest["styles.css"]?.file;
  const dashboard = manifest["index.html"]?.file;
  const account = manifest["account-main.tsx"]?.file;
  return {
    stylesheets: stylesheet ? [`/${stylesheet}`] : [],
    dashboardScript: dashboard ? `/${dashboard}` : undefined,
    accountScript: account ? `/${account}` : undefined,
  };
}
