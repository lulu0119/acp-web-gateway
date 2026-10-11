import assert from "node:assert/strict";
import test from "node:test";
import { addAgentConfig, formatAgentConfigList, parseCommandArgv } from "./agents.js";

test("creating a configuration names it after the type, and a second one needs its own name", () => {
  const first = addAgentConfig({
    agents: [],
    agentType: "opencode",
    env: { OPENCODE_CONFIG: "/tmp/work" },
    knownTypes: ["opencode"],
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
    knownTypes: ["opencode"],
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
    knownTypes: ["opencode"],
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.deepEqual(
    second.agents.map((agent) => agent.name),
    ["opencode", "personal"],
  );
});

test("an unknown agent type points at the registry list", () => {
  const added = addAgentConfig({
    agents: [],
    agentType: "not-a-type",
    env: {},
    knownTypes: ["opencode"],
  });
  assert.deepEqual(added, { ok: false, message: 'Unknown agent type "not-a-type". Run mukae agent-config types.' });
});

test("a custom command is stored beside the name", () => {
  const added = addAgentConfig({
    agents: [],
    agentType: "custom",
    name: "mine",
    env: {},
    command: "my-agent",
    args: ["--stdio"],
    knownTypes: [],
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.deepEqual(added.agents, [{ name: "mine", agentType: "custom", env: {}, command: "my-agent", args: ["--stdio"] }]);
});

test("a command string keeps quotes and does not run a shell", () => {
  assert.deepEqual(parseCommandArgv("npx -y my-acp-agent --stdio"), ["npx", "-y", "my-acp-agent", "--stdio"]);
  assert.deepEqual(parseCommandArgv('my-agent --name "work box"'), ["my-agent", "--name", "work box"]);
  assert.equal(parseCommandArgv('npx "unfinished'), undefined);
  assert.equal(parseCommandArgv("   "), undefined);
});

test("an empty configuration list tells the person the create command", () => {
  assert.match(formatAgentConfigList([]), /agent-config create --agent-type opencode/);
  assert.equal(formatAgentConfigList([{ name: "work", agentType: "opencode", env: {} }]), "work\topencode\n");
});
