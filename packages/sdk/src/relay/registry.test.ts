import assert from "node:assert/strict";
import { test } from "vitest";
import type { AttachCloseReason, DaemonMessage, RelayMessage } from "../index.js";
import { createRegistry, type BrowserSocket, type Registry } from "./registry.js";

const hello: DaemonMessage = { type: "hello", protocolVersion: 1, platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] };

test("a device is online only for the account that connected it, under its device id", () => {
  const registry = createRegistry();
  const ada = registry.connectDaemon({ userId: "ada", close: () => undefined, send: () => undefined });
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

test("a daemon for a device the account has not registered is turned away", () => {
  const registry = createRegistry({ seen: ({ deviceId }) => deviceId === "device-studio-1" });
  const closed: string[] = [];
  const stranger = registry.connectDaemon({ userId: "ada", close: (reason) => closed.push(reason), send: () => undefined });
  stranger.receive({ ...hello, deviceId: "device-unknown-1" });
  assert.deepEqual(closed, ["revoked"]);
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("a hello in a version the relay does not speak, or a message before hello, closes the device socket", () => {
  const registry = createRegistry();
  const closed: string[] = [];
  const later = registry.connectDaemon({ userId: "ada", close: (reason) => closed.push(reason), send: () => undefined });
  later.receive({ ...hello, protocolVersion: 2 });
  const early = registry.connectDaemon({ userId: "ada", close: (reason) => closed.push(reason), send: () => undefined });
  early.receive({ type: "opened", connectionId: "c".repeat(22) });
  assert.deepEqual(closed, ["unsupported_version", "invalid_message"]);
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("disconnecting a removed device ends its connection and its sessions", async () => {
  const registry = createRegistry({ openTimeoutMs: 1_000 });
  const closed: string[] = [];
  const daemon = registry.connectDaemon({ userId: "ada", close: (reason) => closed.push(reason), send: () => undefined });
  daemon.receive(hello);
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  registry.disconnectDevice({ userId: "bea", deviceId: "device-studio-1" });
  assert.deepEqual(closed, []);
  registry.disconnectDevice({ userId: "ada", deviceId: "device-studio-1" });
  assert.deepEqual(closed, ["revoked"]);
  assert.deepEqual(await pending, { ok: false, status: 502, code: "agent_start_failed", message: "The device did not start the agent." });
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("a newer connection with the same device id takes the place of the old one", async () => {
  const registry = createRegistry({ openTimeoutMs: 1_000 });
  const closed: string[] = [];
  const old = registry.connectDaemon({ userId: "ada", close: (reason) => closed.push(reason), send: () => undefined });
  old.receive(hello);
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  const bea = registry.connectDaemon({ userId: "bea", close: () => assert.fail("another account's connection was closed"), send: () => undefined });
  bea.receive(hello);

  const sent: RelayMessage[] = [];
  const fresh = registry.connectDaemon({ userId: "ada", close: () => assert.fail("the newer connection was closed"), send: (message) => sent.push(message) });
  fresh.receive({ ...hello, hostname: "studio-renamed" });
  assert.deepEqual(closed, ["replaced"]);
  assert.equal((await pending).ok, false);
  assert.deepEqual(registry.listDevices("ada").map((device) => device.hostname), ["studio-renamed"]);
  assert.equal(registry.listDevices("bea").length, 1);

  // The old socket closing, or saying hello again, leaves the newer connection alone.
  old.receive(hello);
  old.close();
  assert.deepEqual(registry.listDevices("ada").map((device) => device.hostname), ["studio-renamed"]);
  void registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  assert.equal(sent[0]?.type, "open");
});

test("opening waits until the device starts the agent, and the dial consumes the ticket", async () => {
  const { registry, daemon, sent, connectionId, ticket } = await opened();
  const browserFrames: string[] = [];
  const taken = registry.takeTicket(ticket, fakeBrowser(browserFrames));
  assert.equal(taken.ok, true);
  if (!taken.ok) return;
  daemon.receive({ type: "frame", connectionId, payload: "{\"id\":1}" });
  assert.deepEqual(browserFrames, ['{"id":1}']);
  taken.link.frame('{"id":2}');
  assert.deepEqual(sent.at(-1), { type: "frame", connectionId, payload: '{"id":2}' });
  assert.deepEqual(registry.takeTicket(ticket, fakeBrowser([])), { ok: false });

  const missing = await registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "other" });
  assert.equal(missing.ok ? undefined : missing.code, "target_not_found");
});

test("a socket that closes ends the connection, and a second dial cannot take it over", async () => {
  const { registry, sent, connectionId, ticket } = await opened();
  const first = registry.takeTicket(ticket, fakeBrowser([]));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  first.link.close();
  assert.deepEqual(sent.at(-1), { type: "close", connectionId });
  assert.deepEqual(registry.takeTicket(ticket, fakeBrowser([])), { ok: false });
  assert.deepEqual(registry.listSessions("ada"), []);
});

test("frames the agent writes before the dial wait for it, up to a frame's worth", async () => {
  const early = await opened();
  early.daemon.receive({ type: "frame", connectionId: early.connectionId, payload: '{"method":"log"}' });
  const frames: string[] = [];
  assert.equal(early.registry.takeTicket(early.ticket, fakeBrowser(frames)).ok, true);
  assert.deepEqual(frames, ['{"method":"log"}']);

  const flood = await opened();
  flood.daemon.receive({ type: "frame", connectionId: flood.connectionId, payload: "x".repeat(1_048_576) });
  flood.daemon.receive({ type: "frame", connectionId: flood.connectionId, payload: "x" });
  assert.deepEqual(flood.sent.at(-1), { type: "close", connectionId: flood.connectionId });
  assert.deepEqual(flood.registry.takeTicket(flood.ticket, fakeBrowser([])), { ok: false });
});

test("the socket hears why its connection ended", async () => {
  const exited = await opened();
  const reasons: AttachCloseReason[] = [];
  exited.registry.takeTicket(exited.ticket, fakeBrowser([], reasons));
  exited.daemon.receive({ type: "close", connectionId: exited.connectionId });

  const gone = await opened();
  gone.registry.takeTicket(gone.ticket, fakeBrowser([], reasons));
  gone.daemon.close();
  assert.deepEqual(reasons, ["agent_exited", "device_gone"]);
});

test("a device message for a connection the relay does not hold is answered with close", async () => {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 10 });
  const daemon = registry.connectDaemon({ userId: "ada", close: () => undefined, send: (message) => sent.push(message) });
  daemon.receive(hello);
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  const open = sent[0];
  if (open?.type !== "open") throw new Error("expected open");
  assert.equal((await pending).ok, false);
  sent.length = 0;
  // The open timed out; the agent started anyway.
  daemon.receive({ type: "opened", connectionId: open.connectionId });
  daemon.receive({ type: "close", connectionId: open.connectionId });
  assert.deepEqual(sent, [{ type: "close", connectionId: open.connectionId }]);
});

test("a ticket that nobody dials ends the session", async () => {
  let clock = 0;
  const { registry, sent, ticket } = await opened({ now: () => clock, ticketTtlMs: 10 });
  clock = 11;
  assert.deepEqual(registry.takeTicket(ticket, fakeBrowser([])), { ok: false });
  assert.equal(sent.at(-1)?.type, "close");
});

test("live sessions are listed per account without reading ACP payloads", async () => {
  const { registry, daemon } = await opened();
  const bea = registry.connectDaemon({ userId: "bea", close: () => undefined, send: () => undefined });
  bea.receive({ ...hello, hostname: "field", deviceId: "device-field-1" });
  assert.deepEqual(registry.listSessions("ada"), [{ deviceId: "device-studio-1", agentName: "work", agentType: "opencode", clientId: "notes" }]);
  assert.deepEqual(registry.listSessions("bea"), []);
  daemon.close();
  assert.deepEqual(registry.listSessions("ada"), []);
});

/** A registry with one device, and one session the device opened. */
async function opened(options?: { now?: () => number; ticketTtlMs?: number }): Promise<{
  registry: Registry;
  daemon: ReturnType<Registry["connectDaemon"]>;
  sent: RelayMessage[];
  connectionId: string;
  ticket: string;
}> {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 1_000, ticketTtlMs: 5_000, ...options });
  const daemon = registry.connectDaemon({ userId: "ada", close: () => undefined, send: (message) => sent.push(message) });
  daemon.receive(hello);
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  const open = sent[0];
  if (open?.type !== "open") throw new Error("expected open");
  daemon.receive({ type: "opened", connectionId: open.connectionId });
  const result = await pending;
  if (!result.ok) throw new Error("expected a ticket");
  return { registry, daemon, sent, connectionId: open.connectionId, ticket: result.ticket };
}

function fakeBrowser(frames: string[], reasons: AttachCloseReason[] = []): BrowserSocket {
  return {
    send(payload) {
      frames.push(payload);
    },
    close(reason) {
      reasons.push(reason);
    },
  };
}
