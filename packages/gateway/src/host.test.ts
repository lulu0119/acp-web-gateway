import assert from "node:assert/strict";
import test from "node:test";
import type { DaemonMessage } from "@mukae/contract";
import type { StoredAgent } from "./config.js";
import { createDaemonHost, type AgentHooks, type AgentPipe } from "./host.js";

const sessionId = "session-1";

test("hello advertises configured agents and open pipes one of them", () => {
  const sent: DaemonMessage[] = [];
  const writes: string[] = [];
  let hooks: AgentHooks | undefined;
  const host = createDaemonHost({
    hostname: "studio",
    agents: [{ name: "work", agentType: "opencode", env: {} }],
    send: (message) => sent.push(message),
    spawnAgent: (_agent, next) => {
      hooks = next;
      next.onReady();
      return pipe(writes);
    },
  });
  host.hello();
  host.receive({ type: "open", sessionId, agentName: "work" });
  hooks?.onFrame('{"id":1}');
  host.receive({ type: "frame", sessionId, payload: '{"id":2}' });
  host.receive({ type: "close", sessionId });
  assert.deepEqual(sent, [
    { type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] },
    { type: "opened", sessionId },
    { type: "frame", sessionId, payload: '{"id":1}' },
  ]);
  assert.deepEqual(writes, ['{"id":2}']);
});

test("an unknown agent fails without a process", () => {
  const sent: DaemonMessage[] = [];
  const host = createDaemonHost({
    hostname: "studio",
    agents: [],
    send: (message) => sent.push(message),
    spawnAgent: () => {
      throw new Error("spawned");
    },
  });
  host.receive({ type: "open", sessionId, agentName: "missing" });
  assert.deepEqual(sent, [{ type: "open-failed", sessionId, message: "That agent is not configured." }]);
});

test("the agent exiting tells the relay to close", () => {
  const sent: DaemonMessage[] = [];
  let hooks: AgentHooks | undefined;
  const host = createDaemonHost({
    hostname: "studio",
    agents: [agent],
    send: (message) => sent.push(message),
    spawnAgent: (_agent, next) => {
      hooks = next;
      next.onReady();
      return pipe([]);
    },
  });
  host.receive({ type: "open", sessionId, agentName: "work" });
  hooks?.onClose();
  assert.deepEqual(sent.at(-1), { type: "close", sessionId });
});

const agent: StoredAgent = { name: "work", agentType: "opencode", env: {} };

function pipe(writes: string[]): AgentPipe {
  return {
    write: (text) => writes.push(text),
    stop() {},
  };
}
