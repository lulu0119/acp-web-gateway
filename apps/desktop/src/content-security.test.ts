import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const registryIconOrigin = "https://cdn.agentclientprotocol.com";

test("the desktop window can load ACP registry icons", () => {
  const configPath = join(dirname(fileURLToPath(import.meta.url)), "../src-tauri/tauri.conf.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as { app: { security: { csp: string } } };
  const imgSrc = config.app.security.csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("img-src"));
  expect(imgSrc?.split(/\s+/)).toContain(registryIconOrigin);
});
