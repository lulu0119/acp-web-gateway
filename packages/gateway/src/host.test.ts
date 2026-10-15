import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import type { DaemonMessage } from "@exterior/contract";
import type { StoredAgent } from "./config.js";
import { createDaemonHost, type AgentHooks, type AgentPipe } from "./host.js";

const sessionId = "session-1";
const workingDirectory = join("home", "person", "workspace");

test("hello advertises configured agents and the device directory", () => {
  const sent: DaemonMessage[] = [];
  const host = createDaemonHost({
    hostname: "studio",
    workingDirectory,
    agents: [{ name: "work", agentType: "opencode", env: {} }],
    send: (message) => sent.push(message),
    resolveLaunch: readyLaunch,
    spawnAgent: () => {
      throw new Error("spawned");
    },
  });
  host.hello();
  assert.deepEqual(sent, [
    {
      type: "hello",
      hostname: "studio",
      workingDirectory,
      agents: [{ name: "work", agentType: "opencode" }],
    },
  ]);
});

test("hello advertises a custom agent only while its command is installed", () => {
  const sent: DaemonMessage[] = [];
  const host = createDaemonHost({
    hostname: "studio",
    workingDirectory,
    agents: [{ name: "mine", agentType: "custom", env: {}, command: "my-agent" }],
    send: (message) => sent.push(message),
    resolveLaunch: () => undefined,
  });
  host.hello();
  assert.deepEqual(sent, [{ type: "hello", hostname: "studio", workingDirectory, agents: [] }]);
});

test("open pipes one agent and the agent exiting tells the relay to close", () => {
  const sent: DaemonMessage[] = [];
  const writes: string[] = [];
  let hooks: AgentHooks | undefined;
  const host = createDaemonHost({
    hostname: "studio",
    workingDirectory,
    agents: [agent],
    send: (message) => sent.push(message),
    resolveLaunch: readyLaunch,
    spawnAgent: (_launch, next) => {
      hooks = next;
      next.onReady();
      return pipe(writes);
    },
  });
  host.receive({ type: "open", sessionId, agentName: "work" });
  hooks?.onFrame('{"id":1}');
  host.receive({ type: "frame", sessionId, payload: '{"id":2}' });
  hooks?.onClose();
  assert.deepEqual(sent, [
    { type: "opened", sessionId },
    { type: "frame", sessionId, payload: '{"id":1}' },
    { type: "close", sessionId },
  ]);
  assert.deepEqual(writes, ['{"id":2}']);
});

test("an unknown agent fails without a process", () => {
  const sent: DaemonMessage[] = [];
  const host = createDaemonHost({
    hostname: "studio",
    workingDirectory,
    agents: [],
    send: (message) => sent.push(message),
    resolveLaunch: readyLaunch,
    spawnAgent: () => {
      throw new Error("spawned");
    },
  });
  host.receive({ type: "open", sessionId, agentName: "missing" });
  assert.deepEqual(sent, [{ type: "open-failed", sessionId, message: "That agent is not configured." }]);
});

test("hello omits an agent the registry cannot launch", () => {
  const sent: DaemonMessage[] = [];
  const host = createDaemonHost({
    hostname: "studio",
    workingDirectory,
    agents: [agent],
    send: (message) => sent.push(message),
    resolveLaunch: () => undefined,
    spawnAgent: () => {
      throw new Error("spawned");
    },
  });
  host.hello();
  host.receive({ type: "open", sessionId, agentName: "work" });
  assert.deepEqual(sent, [
    { type: "hello", hostname: "studio", workingDirectory, agents: [] },
    { type: "open-failed", sessionId, message: "That agent is not configured." },
  ]);
});

test("an argument a batch script cannot take fails the open instead of reaching cmd.exe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exterior-batch-"));
  const script = join(directory, "agent.cmd");
  await writeFile(script, "@echo off\n", "utf8");
  const sent: DaemonMessage[] = [];
  const host = createDaemonHost({
    hostname: "studio",
    workingDirectory,
    agents: [agent],
    send: (message) => sent.push(message),
    resolveLaunch: () => ({ executable: { kind: "batch", path: script }, args: ["--flag&echo"], env: {} }),
  });
  host.receive({ type: "open", sessionId, agentName: "work" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(sent, [
    { type: "open-failed", sessionId, message: 'The argument "--flag&echo" cannot be passed to a batch command.' },
  ]);
});

const agent: StoredAgent = { name: "work", agentType: "opencode", env: {} };

function readyLaunch(stored: StoredAgent) {
  return { executable: { kind: "image", path: join("usr", "bin", "opencode") } as const, args: ["acp"], env: stored.env };
}

function pipe(writes: string[]): AgentPipe {
  return {
    write: (text) => writes.push(text),
    stop() {},
  };
}
