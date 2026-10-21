import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import type { DaemonMessage } from "../index.js";
import { createDeviceHost, devicePlatform, type AgentHooks, type AgentPipe, type LaunchAgent } from "./host.js";

const sessionId = "session-1";
const workingDirectory = join("home", "person", "workspace");
const work = { name: "work", agentType: "opencode" };

test("hello advertises the offered agents, the device directory, and the platform", () => {
  const sent: DaemonMessage[] = [];
  const host = createDeviceHost({
    deviceId: "device-studio-1",
    hostname: "studio",
    platform: "windows",
    workingDirectory,
    agents: [work],
    send: (message) => sent.push(message),
    launch: () => {
      throw new Error("launched");
    },
  });
  host.hello();
  assert.deepEqual(sent, [
    { type: "hello", hostname: "studio", deviceId: "device-studio-1", workingDirectory, platform: "windows", agents: [work] },
  ]);
});

test("open pipes one agent and the agent exiting tells the relay to close", () => {
  const sent: DaemonMessage[] = [];
  const writes: string[] = [];
  let hooks: AgentHooks | undefined;
  const host = createDeviceHost({
    deviceId: "device-studio-1",
    hostname: "studio",
    platform: "linux",
    workingDirectory,
    agents: [work],
    send: (message) => sent.push(message),
    launch: (_agentName, next) => {
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

test("an agent the device does not offer, or cannot launch, fails without a process", () => {
  const sent: DaemonMessage[] = [];
  const launched: string[] = [];
  const host = createDeviceHost({
    deviceId: "device-studio-1",
    hostname: "studio",
    platform: "linux",
    workingDirectory,
    agents: [work],
    send: (message) => sent.push(message),
    launch: (agentName) => {
      launched.push(agentName);
      return undefined;
    },
  });
  host.receive({ type: "open", sessionId, agentName: "missing" });
  host.receive({ type: "open", sessionId: "session-2", agentName: "work" });
  assert.deepEqual(sent, [
    { type: "open-failed", sessionId, message: "That agent is not configured." },
    { type: "open-failed", sessionId: "session-2", message: "That agent is not configured." },
  ]);
  assert.deepEqual(launched, ["work"]);
});

test("a new agent list says hello again, and an open session keeps its agent", () => {
  const sent: DaemonMessage[] = [];
  const stopped: string[] = [];
  const launch: LaunchAgent = (agentName, next) => {
    next.onReady();
    return { write() {}, stop: () => stopped.push(agentName) };
  };
  const host = createDeviceHost({
    deviceId: "device-studio-1",
    hostname: "studio",
    platform: "linux",
    workingDirectory,
    agents: [work],
    send: (message) => sent.push(message),
    launch,
  });
  host.receive({ type: "open", sessionId, agentName: "work" });
  host.setAgents([{ name: "other", agentType: "opencode" }]);
  host.receive({ type: "open", sessionId: "session-2", agentName: "work" });
  host.receive({ type: "open", sessionId: "session-3", agentName: "other" });
  assert.deepEqual(sent, [
    { type: "opened", sessionId },
    { type: "hello", hostname: "studio", deviceId: "device-studio-1", workingDirectory, platform: "linux", agents: [{ name: "other", agentType: "opencode" }] },
    { type: "open-failed", sessionId: "session-2", message: "That agent is not configured." },
    { type: "opened", sessionId: "session-3" },
  ]);
  assert.deepEqual(stopped, []);
});

test("a device reports the platforms EAP names", () => {
  assert.equal(devicePlatform("darwin"), "macos");
  assert.equal(devicePlatform("win32"), "windows");
  assert.equal(devicePlatform("linux"), "linux");
  assert.equal(devicePlatform("freebsd"), undefined);
});

function pipe(writes: string[]): AgentPipe {
  return {
    write: (text) => writes.push(text),
    stop() {},
  };
}
