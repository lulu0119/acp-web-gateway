import assert from "node:assert/strict";
import { test } from "vitest";
import { addAgent, formatAgentList } from "./agents.js";

test("an agent is named after its type, and a second one needs its own name", () => {
  const first = addAgent({
    agents: [],
    agentType: "opencode",
    env: { OPENCODE_CONFIG: "/tmp/work" },
    knownTypes: ["opencode"],
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.addedName, "opencode");
  assert.deepEqual(first.agents, [
    { name: "opencode", agentType: "opencode", env: { OPENCODE_CONFIG: "/tmp/work" } },
  ]);

  const duplicate = addAgent({
    agents: first.agents,
    agentType: "opencode",
    env: {},
    knownTypes: ["opencode"],
  });
  assert.deepEqual(duplicate, {
    ok: false,
    message: 'An agent named "opencode" already exists. Pass --name to add another of this type.',
  });

  const second = addAgent({
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
  const added = addAgent({
    agents: [],
    agentType: "not-a-type",
    env: {},
    knownTypes: ["opencode"],
  });
  assert.deepEqual(added, { ok: false, message: 'Unknown agent type "not-a-type". Run exterior registry search.' });
});

test("a custom command is stored beside the name", () => {
  const added = addAgent({
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

test("an empty agent list tells the person the add command", () => {
  assert.match(formatAgentList([]), /exterior agent add opencode/);
  assert.equal(formatAgentList([{ name: "work", agentType: "opencode", env: {} }]), "work\topencode\n");
});
