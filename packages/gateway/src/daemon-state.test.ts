import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { daemonStateDirectory, daemonStateReporter, parseDaemonState, readDaemonState, writeDaemonState } from "./daemon-state.js";

const relayUrl = "https://relay.example";

test("state is one file per relay under the state directory", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-state-"));
  await writeDaemonState({ relayUrl, pid: process.pid, status: "connected", since: 1, agents: ["work"] }, home);
  assert.equal(daemonStateDirectory(home), join(home, ".local", "state", "exterior", "daemons"));
  assert.deepEqual(await readdir(daemonStateDirectory(home)), ["https_relay.example.json"]);
  assert.deepEqual(await readDaemonState(relayUrl, home), { relayUrl, pid: process.pid, status: "connected", since: 1, agents: ["work"] });
  assert.equal(await readDaemonState("https://other.example", home), undefined);
});

test("a daemon that died without saying so reads as stopped", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-state-"));
  await writeDaemonState({ relayUrl, pid: 4242, status: "connected", since: 1, agents: [] }, home);
  assert.deepEqual(await readDaemonState(relayUrl, home, () => false), {
    relayUrl, pid: 4242, status: "stopped", since: 1, agents: [], message: "The daemon exited without saying why.",
  });
  assert.equal((await readDaemonState(relayUrl, home, () => true))?.status, "connected");
});

test("the reporter writes each change in order and dates only a new status", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-state-"));
  let clock = 100;
  const state = daemonStateReporter({ relayUrl, agents: ["work"], homeDirectory: home, now: () => clock });
  clock = 200;
  state.status("connected");
  clock = 300;
  state.agents(["work", "home"]);
  clock = 400;
  await state.stopped("Relay rejected this device (HTTP 403).");
  assert.deepEqual(await readDaemonState(relayUrl, home), {
    relayUrl, pid: process.pid, status: "stopped", since: 400, agents: ["work", "home"], message: "Relay rejected this device (HTTP 403).",
  });
});

test("a state file that is not a state is ignored", () => {
  assert.equal(parseDaemonState({ relayUrl, pid: 1, status: "asleep", since: 1, agents: [] }), undefined);
  assert.equal(parseDaemonState({ relayUrl, pid: 1.5, status: "connected", since: 1, agents: [] }), undefined);
  assert.equal(parseDaemonState({ relayUrl, pid: 1, status: "connected", since: 1, agents: [1] }), undefined);
});
