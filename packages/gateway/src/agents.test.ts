import assert from "node:assert/strict";
import test from "node:test";
import { addAgentConfig, formatAgentConfigList, knownAgentTypes, launchForAgentType } from "./agents.js";

test("the built-in table launches registry agents as argv, without a shell command string", () => {
  assert.deepEqual(knownAgentTypes(), ["claude-acp", "codex-acp", "gemini", "opencode"]);
  assert.deepEqual(launchForAgentType("claude-acp"), {
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp@0.89.1"],
  });
  assert.deepEqual(launchForAgentType("codex-acp"), {
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp@2.2.2"],
  });
  assert.deepEqual(launchForAgentType("gemini"), {
    command: "npx",
    args: ["-y", "@google/gemini-cli@0.63.0", "--acp"],
  });
  assert.deepEqual(launchForAgentType("opencode"), { command: "opencode", args: ["acp"] });
  assert.equal(launchForAgentType("claude"), undefined);
});

test("creating a configuration names it after the type, and a second one needs its own name", () => {
  const first = addAgentConfig({
    agents: [],
    agentType: "opencode",
    env: { OPENCODE_CONFIG: "/tmp/work" },
    knownTypes: knownAgentTypes(),
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.createdName, "opencode");
  assert.deepEqual(first.agents, [
    { name: "opencode", agentType: "opencode", env: { OPENCODE_CONFIG: "/tmp/work" } },
  ]);

  const duplicate = addAgentConfig({
    agents: first.agents,
    agentType: "opencode",
    env: {},
    knownTypes: knownAgentTypes(),
  });
  assert.deepEqual(duplicate, {
    ok: false,
    message: 'An agent configuration named "opencode" already exists. Pass --name to add another of this type.',
  });

  const second = addAgentConfig({
    agents: first.agents,
    agentType: "opencode",
    name: "personal",
    env: {},
    knownTypes: knownAgentTypes(),
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.deepEqual(
    second.agents.map((agent) => agent.name),
    ["opencode", "personal"],
  );
});

test("an unknown agent type is refused and the message lists the known types", () => {
  const added = addAgentConfig({
    agents: [],
    agentType: "not-a-type",
    env: {},
    knownTypes: knownAgentTypes(),
  });
  assert.equal(added.ok, false);
  if (added.ok) return;
  assert.match(added.message, /Unknown agent type "not-a-type"/);
  assert.match(added.message, /opencode/);
});

test("an empty configuration list tells the person the create command", () => {
  assert.match(formatAgentConfigList([]), /agent-config create --agent-type opencode/);
  assert.equal(formatAgentConfigList([{ name: "work", agentType: "opencode", env: {} }]), "work\topencode\n");
});
