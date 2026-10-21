import assert from "node:assert/strict";
import { test } from "vitest";
import { readFileSync } from "node:fs";
import { exteriorDeviceClient, registryIconUrl } from "./index.js";

test("registry icons are usable https addresses", () => {
  assert.equal(registryIconUrl("https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg"), "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg");
  assert.equal(registryIconUrl("http://cdn.agentclientprotocol.com/opencode.svg"), undefined);
  assert.equal(registryIconUrl("not a url"), undefined);
  assert.equal(registryIconUrl(""), undefined);
  assert.equal(registryIconUrl(undefined), undefined);
  assert.equal(registryIconUrl(`https://${"x".repeat(2048)}`), undefined);
});

test("the daemon's metadata document is the one the project publishes", () => {
  const published: unknown = JSON.parse(readFileSync(new URL("../../../apps/example/public/device-client.json", import.meta.url), "utf8"));
  assert.deepEqual(published, exteriorDeviceClient);
});
