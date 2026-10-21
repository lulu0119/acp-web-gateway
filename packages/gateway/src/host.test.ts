import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { generateDeviceKey, type DeviceMessage } from "@exterioragentprotocol/sdk/device";
import type { StoredAgent } from "./config.js";
import { createDaemonHost } from "./host.js";

const connectionId = "connection-1-aaaaaaaaaaa";
const workingDirectory = join("home", "person", "workspace");
const relayUrl = "http://127.0.0.1:1";
const deviceKey = await generateDeviceKey();

test("hello advertises a custom agent only while its command is installed", () => {
  const sent: DeviceMessage[] = [];
  const host = createDaemonHost({
    relayUrl,
    deviceKey,
    hostname: "studio",
    platform: "linux",
    workingDirectory,
    agents: [{ name: "mine", agentType: "custom", env: {}, command: "my-agent" }],
    resolveLaunch: () => undefined,
  });
  host.attach((message) => sent.push(message));
  assert.deepEqual(sent, [{ type: "hello", hostname: "studio", workingDirectory, platform: "linux", agents: [] }]);
});

test("hello omits an agent the registry cannot launch, and opening it fails", () => {
  const sent: DeviceMessage[] = [];
  const host = createDaemonHost({
    relayUrl,
    deviceKey,
    hostname: "studio",
    platform: "linux",
    workingDirectory,
    agents: [agent],
    resolveLaunch: () => undefined,
    spawnAgent: () => assert.fail("spawned"),
  });
  host.attach((message) => sent.push(message));
  host.receive({ type: "open", connectionId, agentName: "work" });
  assert.deepEqual(sent, [
    { type: "hello", hostname: "studio", workingDirectory, platform: "linux", agents: [] },
    { type: "open_failed", connectionId, message: "That agent is not configured." },
  ]);
});

test("a new configuration offers the agents it can launch", () => {
  const sent: DeviceMessage[] = [];
  const host = createDaemonHost({
    relayUrl,
    deviceKey,
    hostname: "studio",
    platform: "linux",
    workingDirectory,
    agents: [],
    resolveLaunch: (stored) => (stored.name === "work" ? readyLaunch(stored) : undefined),
  });
  host.attach((message) => sent.push(message));
  sent.length = 0;
  host.setAgents([agent, { name: "mine", agentType: "custom", env: {}, command: "my-agent" }]);
  assert.deepEqual(sent, [
    { type: "hello", hostname: "studio", workingDirectory, platform: "linux", agents: [{ name: "work", agentType: "opencode" }] },
  ]);
});

test("an argument a batch script cannot take fails the open instead of reaching cmd.exe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exterior-batch-"));
  const script = join(directory, "agent.cmd");
  await writeFile(script, "@echo off\n", "utf8");
  const sent: DeviceMessage[] = [];
  const host = createDaemonHost({
    relayUrl,
    deviceKey,
    hostname: "studio",
    platform: "linux",
    workingDirectory,
    agents: [agent],
    resolveLaunch: () => ({ executable: { kind: "batch", path: script }, args: ["--flag&echo"], env: {} }),
  });
  host.attach((message) => sent.push(message));
  sent.length = 0;
  host.receive({ type: "open", connectionId, agentName: "work" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(sent, [
    { type: "open_failed", connectionId, message: 'The argument "--flag&echo" cannot be passed to a batch command.' },
  ]);
});

const agent: StoredAgent = { name: "work", agentType: "opencode", env: {} };

function readyLaunch(stored: StoredAgent) {
  return { executable: { kind: "image", path: join("usr", "bin", "opencode") } as const, args: ["acp"], env: stored.env };
}
