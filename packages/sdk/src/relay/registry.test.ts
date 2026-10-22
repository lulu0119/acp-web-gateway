import assert from "node:assert/strict";
import { test } from "vitest";
import type { AttachCloseReason, DeviceMessage, RelayMessage } from "../index.js";
import { createRegistry, type AgentSocket, type AttachSocket, type Registry } from "./registry.js";

const hello: DeviceMessage = { type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] };
const studio = { userId: "ada", deviceId: "device-studio-1" };

test("a device is online only for the account that connected it, under the device id of its token", () => {
  const registry = createRegistry();
  const ada = registry.connectDevice({ ...studio, close: () => undefined, send: () => undefined });
  ada.receive(hello);
  assert.deepEqual(registry.listDevices("ada"), [
    {
      id: "device-studio-1",
      hostname: "studio",
      agents: [{ name: "work", agentType: "opencode" }],
      workingDirectory: "/home/ada/work",
      platform: "linux",
    },
  ]);
  assert.deepEqual(registry.listDevices("bea"), []);
  ada.close();
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("a device is seen when it says hello and when its socket closes", () => {
  const seen: string[] = [];
  const registry = createRegistry({ seen: ({ deviceId, hostname }) => void seen.push(`${deviceId} ${hostname}`) });
  const device = registry.connectDevice({ ...studio, close: () => undefined, send: () => undefined });
  device.receive(hello);
  device.close();
  assert.deepEqual(seen, ["device-studio-1 studio", "device-studio-1 studio"]);
});

test("a message before hello closes the device socket", () => {
  const registry = createRegistry();
  const closed: string[] = [];
  const early = registry.connectDevice({ ...studio, close: (reason) => closed.push(reason), send: () => undefined });
  early.receive({ type: "open_failed", connectionId: "c".repeat(22), message: "No." });
  assert.deepEqual(closed, ["invalid_message"]);
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("a newer device socket takes the place of the old one, and leaves running connections alone", async () => {
  const { registry, agent, client } = await attached();
  const closed: string[] = [];
  const old = registry.connectDevice({ ...studio, close: (reason) => closed.push(reason), send: () => undefined });
  old.receive(hello);
  const sent: RelayMessage[] = [];
  const fresh = registry.connectDevice({ ...studio, close: () => assert.fail("the newer socket was closed"), send: (message) => sent.push(message) });
  fresh.receive({ ...hello, hostname: "studio-renamed" });
  assert.deepEqual(closed, ["replaced"]);
  // The old socket saying hello again, or closing, leaves the newer one alone.
  old.receive(hello);
  old.close();
  assert.deepEqual(registry.listDevices("ada").map((device) => device.hostname), ["studio-renamed"]);
  void registry.openConnection({ ...studio, clientId: "notes", agentName: "work" });
  assert.equal(sent[0]?.type, "open");
  assert.equal(agent.closed, false);
  assert.deepEqual(client.reasons, []);
});

test("opening answers once the device dials the agent socket, and the ticket joins the two sockets", async () => {
  const setup = online();
  const { registry, sent } = setup;
  const pending = registry.openConnection({ ...studio, clientId: "notes", agentName: "work" });
  const { connectionId } = setup;
  assert.deepEqual(sent, [{ type: "open", connectionId, agentName: "work" }]);
  const agent = fakeAgent();
  // Only the device the connection was opened on can answer it.
  assert.equal(registry.acceptAgent({ connectionId, deviceId: "device-other-1" }, fakeAgent()), undefined);
  const agentLink = registry.acceptAgent({ connectionId, deviceId: "device-studio-1" }, agent);
  assert.ok(agentLink);
  assert.equal(agent.paused, true);
  const result = await pending;
  if (!result.ok) throw new Error("expected a ticket");
  assert.equal(registry.acceptAgent({ connectionId, deviceId: "device-studio-1" }, fakeAgent()), undefined);

  const client = fakeClient();
  const clientLink = registry.acceptClient(result.ticket, client);
  assert.ok(clientLink);
  assert.equal(agent.paused, false);
  clientLink.frame('{"id":1}');
  agentLink.frame('{"id":1,"result":{}}');
  assert.deepEqual(agent.frames, ['{"id":1}']);
  assert.deepEqual(client.frames, ['{"id":1,"result":{}}']);
  assert.equal(registry.acceptClient(result.ticket, fakeClient()), undefined);

  const missing = await registry.openConnection({ ...studio, clientId: "notes", agentName: "other" });
  assert.equal(missing.ok ? undefined : missing.code, "target_not_found");
});

test("a device that cannot start the agent says why, and one that does not answer times out", async () => {
  const failing = online();
  const pending = failing.registry.openConnection({ ...studio, clientId: "notes", agentName: "work" });
  failing.device.receive({ type: "open_failed", connectionId: failing.connectionId, message: "npx is not installed." });
  assert.deepEqual(await pending, { ok: false, status: 502, code: "agent_start_failed", message: "npx is not installed." });
  assert.equal(failing.registry.acceptAgent({ connectionId: failing.connectionId, deviceId: "device-studio-1" }, fakeAgent()), undefined);

  const silent = online({ openTimeoutMs: 5 });
  const timedOut = await silent.registry.openConnection({ ...studio, clientId: "notes", agentName: "work" });
  assert.equal(timedOut.ok ? undefined : timedOut.code, "device_timeout");
  // The agent started after the relay gave up: its dial is refused, and the device stops it.
  assert.equal(silent.registry.acceptAgent({ connectionId: silent.connectionId, deviceId: "device-studio-1" }, fakeAgent()), undefined);
});

test("closing either socket closes the other, and the client hears why", async () => {
  const left = await attached();
  left.clientLink.closed();
  assert.equal(left.agent.closed, true);
  assert.deepEqual(left.registry.listConnections("ada"), []);

  const exited = await attached();
  exited.agentLink.closed(true);
  const dropped = await attached();
  dropped.agentLink.closed(false);
  assert.deepEqual([...exited.client.reasons, ...dropped.client.reasons], ["agent_exited", "device_gone"]);
});

test("a ticket nobody dials in time ends the connection", async () => {
  let clock = 0;
  const setup = online({ now: () => clock, ticketTtlMs: 10 });
  const { registry } = setup;
  const pending = registry.openConnection({ ...studio, clientId: "notes", agentName: "work" });
  const agent = fakeAgent();
  registry.acceptAgent({ connectionId: setup.connectionId, deviceId: "device-studio-1" }, agent);
  const result = await pending;
  if (!result.ok) throw new Error("expected a ticket");
  clock = 11;
  assert.equal(registry.acceptClient(result.ticket, fakeClient()), undefined);
  assert.equal(agent.closed, true);
});

test("a slow socket pauses the one that feeds it until its frames have left", async () => {
  const { agent, client, clientLink, agentLink } = await attached();
  client.unsentBytes = 2 * 1_048_576;
  agentLink.frame("{}");
  assert.equal(agent.paused, true);
  client.unsentBytes = 0;
  client.flush();
  assert.equal(agent.paused, false);
  agent.unsentBytes = 2 * 1_048_576;
  clientLink.frame("{}");
  assert.equal(client.paused, true);
});

test("removing a device closes its device socket and its connections", async () => {
  const { registry, device, agent, client } = await attached();
  const closed: string[] = [];
  device.close();
  const again = registry.connectDevice({ ...studio, close: (reason) => closed.push(reason), send: () => undefined });
  again.receive(hello);
  registry.removeDevice({ userId: "bea", deviceId: "device-studio-1" });
  assert.deepEqual(closed, []);
  registry.removeDevice(studio);
  assert.deepEqual(closed, ["revoked"]);
  assert.equal(agent.closed, true);
  assert.deepEqual(client.reasons, ["device_gone"]);
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("revoking a client ends its connections with revoked, and only its own", async () => {
  const { registry, client, agent } = await attached();
  registry.revokeClient({ userId: "ada", clientId: "other" });
  registry.revokeClient({ userId: "bea", clientId: "notes" });
  assert.deepEqual(client.reasons, []);
  registry.revokeClient({ userId: "ada", clientId: "notes" });
  assert.deepEqual(client.reasons, ["revoked"]);
  assert.equal(agent.closed, true);
});

test("live connections are listed per account", async () => {
  const { registry } = await attached();
  assert.deepEqual(registry.listConnections("ada"), [{ deviceId: "device-studio-1", agentName: "work", agentType: "opencode", clientId: "notes" }]);
  assert.deepEqual(registry.listConnections("bea"), []);
});

/** A registry with one online device. `connectionId` is the id of the first `open` it is sent, once one is. */
function online(options?: Parameters<typeof createRegistry>[0]): {
  registry: Registry;
  device: ReturnType<Registry["connectDevice"]>;
  sent: RelayMessage[];
  readonly connectionId: string;
} {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 1_000, ticketTtlMs: 5_000, ...options });
  const device = registry.connectDevice({ ...studio, close: () => undefined, send: (message) => sent.push(message) });
  device.receive(hello);
  return {
    registry,
    device,
    sent,
    get connectionId() {
      const open = sent[0];
      if (!open) throw new Error("expected open");
      return open.connectionId;
    },
  };
}

/** A registry with one connection whose agent and client sockets are both attached. */
async function attached() {
  const setup = online();
  const { registry, device } = setup;
  const pending = registry.openConnection({ ...studio, clientId: "notes", agentName: "work" });
  const agent = fakeAgent();
  const agentLink = registry.acceptAgent({ connectionId: setup.connectionId, deviceId: "device-studio-1" }, agent);
  const result = await pending;
  if (!agentLink || !result.ok) throw new Error("expected a ticket");
  const client = fakeClient();
  const clientLink = registry.acceptClient(result.ticket, client);
  if (!clientLink) throw new Error("expected the dial to attach");
  return { registry, device, agent, agentLink, client, clientLink };
}

function fakeSocket() {
  const flushes: (() => void)[] = [];
  return {
    frames: [] as string[],
    paused: false,
    unsentBytes: 0,
    send(frame: string, flushed: () => void) {
      this.frames.push(frame);
      flushes.push(flushed);
    },
    unsent() {
      return this.unsentBytes;
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
    flush() {
      for (const flushed of flushes.splice(0)) flushed();
    },
  };
}

function fakeAgent(): AgentSocket & ReturnType<typeof fakeSocket> & { closed: boolean } {
  return Object.assign(fakeSocket(), {
    closed: false,
    close() {
      this.closed = true;
    },
  });
}

function fakeClient(): AttachSocket & ReturnType<typeof fakeSocket> & { reasons: AttachCloseReason[] } {
  return Object.assign(fakeSocket(), {
    reasons: [] as AttachCloseReason[],
    close(reason: AttachCloseReason) {
      this.reasons.push(reason);
    },
  });
}
