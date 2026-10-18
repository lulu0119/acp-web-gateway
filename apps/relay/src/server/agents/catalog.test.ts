import assert from "node:assert/strict";
import { test } from "vitest";
import { createAgentCatalog, parseAgentIcons } from "./catalog.js";

const registryText = JSON.stringify({
  agents: [
    { id: "claude-acp", icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg" },
    { id: "opencode", icon: "http://cdn.agentclientprotocol.com/opencode.svg" },
    { id: "custom", icon: "not a url" },
    { id: "", icon: "https://cdn.agentclientprotocol.com/missing.svg" },
  ],
});

test("registry icons are https addresses keyed by agent id", () => {
  const icons = parseAgentIcons(registryText);
  assert.ok(icons);
  assert.equal(icons.get("claude-acp"), "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg");
  assert.equal(icons.has("opencode"), false);
  assert.equal(icons.has("custom"), false);
  assert.equal(parseAgentIcons("not json"), undefined);
});

test("a fresh icon cache is reused and a failed fetch keeps the previous copy", async () => {
  let now = 0;
  let fetches = 0;
  const catalog = createAgentCatalog({
    now: () => now,
    fetchText: async () => {
      fetches += 1;
      if (fetches === 1) return registryText;
      throw new Error("offline");
    },
  });
  const first = await catalog.icons();
  assert.equal(fetches, 1);
  assert.equal(first.get("claude-acp")?.endsWith("claude-acp.svg"), true);
  now = 60 * 1000;
  assert.equal((await catalog.icons()).get("claude-acp"), first.get("claude-acp"));
  assert.equal(fetches, 1);
  now = 2 * 60 * 60 * 1000;
  const kept = await catalog.icons();
  assert.equal(fetches, 2);
  assert.equal(kept.get("claude-acp"), first.get("claude-acp"));
});
