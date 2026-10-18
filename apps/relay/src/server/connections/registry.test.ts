import assert from "node:assert/strict";
import { test } from "vitest";
import type { DaemonMessage, RelayMessage } from "@exterior/contract";
import { createRegistry, type BrowserSocket } from "./registry.js";

test("a device is online only for the account that connected it, under its device id", () => {
  const registry = createRegistry();
  const ada = registry.connectDaemon({ userId: "ada", close: () => undefined, send: () => undefined });
  ada.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
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
  stranger.receive({ type: "hello", platform: "linux", hostname: "elsewhere", deviceId: "device-unknown-1", workingDirectory: "/home/ada/work", agents: [] });
  assert.deepEqual(closed, ["removed"]);
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("disconnecting a removed device ends its connection and its sessions", async () => {
  const registry = createRegistry({ openTimeoutMs: 1_000 });
  const closed: string[] = [];
  const daemon = registry.connectDaemon({ userId: "ada", close: (reason) => closed.push(reason), send: () => undefined });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  registry.disconnectDevice({ userId: "bea", deviceId: "device-studio-1" });
  assert.deepEqual(closed, []);
  registry.disconnectDevice({ userId: "ada", deviceId: "device-studio-1" });
  assert.deepEqual(closed, ["removed"]);
  assert.deepEqual(await pending, { ok: false, status: 503, message: "The device did not start the agent." });
  assert.deepEqual(registry.listDevices("ada"), []);
});

test("a device lists the working directory its daemon reported", () => {
  const registry = createRegistry();
  const daemon = registry.connectDaemon({ userId: "ada", close: () => undefined, send: () => undefined });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/.local/share/exterior/workspace", agents: [] });
  assert.equal(registry.listDevices("ada")[0]?.workingDirectory, "/home/ada/.local/share/exterior/workspace");
});

test("a newer connection with the same device id takes the place of the old one", async () => {
  const registry = createRegistry({ openTimeoutMs: 1_000 });
  const closed: string[] = [];
  const old = registry.connectDaemon({ userId: "ada", close: (reason) => closed.push(reason), send: () => undefined });
  const hello: DaemonMessage = { type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] };
  old.receive(hello);
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  const bea = registry.connectDaemon({ userId: "bea", close: () => assert.fail("another account's connection was closed"), send: () => undefined });
  bea.receive(hello);

  const sent: RelayMessage[] = [];
  const fresh = registry.connectDaemon({ userId: "ada", close: () => assert.fail("the newer connection was closed"), send: (message) => sent.push(message) });
  fresh.receive({ ...hello, hostname: "studio-renamed" });
  assert.deepEqual(closed, ["replaced"]);
  assert.deepEqual(await pending, { ok: false, status: 503, message: "The device did not start the agent." });
  assert.deepEqual(registry.listDevices("ada").map((device) => device.hostname), ["studio-renamed"]);
  assert.equal(registry.listDevices("bea").length, 1);

  // The old socket closing, or saying hello again, leaves the newer connection alone.
  old.receive(hello);
  old.close();
  assert.deepEqual(registry.listDevices("ada").map((device) => device.hostname), ["studio-renamed"]);
  void registry.openSession({ userId: "ada", clientId: "notes", deviceId: "device-studio-1", agentName: "work" });
  assert.equal(sent[0]?.type, "open");
});

test("opening a session waits until the device starts the agent, then the ticket works once", async () => {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 1_000, ticketTtlMs: 5_000 });
  const daemon = registry.connectDaemon({ userId: "ada", close: () => undefined, send: (message) => sent.push(message) });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
  const deviceId = registry.listDevices("ada")[0]?.id ?? "";

  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId, agentName: "work" });
  const open = sent[0];
  assert.equal(open?.type, "open");
  if (open?.type !== "open") return;
  daemon.receive({ type: "opened", sessionId: open.sessionId });
  const result = await pending;
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const browserFrames: string[] = [];
  const browser = fakeBrowser(browserFrames);
  const taken = registry.takeTicket(result.ticket, browser);
  assert.equal(taken.ok, true);
  if (!taken.ok) return;
  const link = taken.link;
  daemon.receive({ type: "frame", sessionId: open.sessionId, payload: "{\"id\":1}" });
  assert.deepEqual(browserFrames, ['{"id":1}']);
  link.frame('{"id":2}');
  assert.deepEqual(sent.at(-1), { type: "frame", sessionId: open.sessionId, payload: '{"id":2}' });
  assert.deepEqual(registry.takeTicket(result.ticket, fakeBrowser([])), { ok: false, reason: "used" });

  const missing = await registry.openSession({ userId: "ada", clientId: "notes", deviceId, agentName: "other" });
  assert.deepEqual(missing, { ok: false, status: 404, message: "That agent is not configured on the device." });
});

test("a ticket that nobody claims ends the session", async () => {
  let clock = 0;
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ now: () => clock, openTimeoutMs: 50, ticketTtlMs: 10 });
  const daemon = registry.connectDaemon({ userId: "ada", close: () => undefined, send: (message) => sent.push(message) });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
  const deviceId = registry.listDevices("ada")[0]?.id ?? "";
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId, agentName: "work" });
  const open = sent[0];
  if (open?.type !== "open") throw new Error("expected open");
  daemon.receive({ type: "opened", sessionId: open.sessionId });
  const result = await pending;
  assert.equal(result.ok, true);
  if (!result.ok) return;
  clock = 11;
  assert.deepEqual(registry.takeTicket(result.ticket, fakeBrowser([])), { ok: false, reason: "expired" });
  assert.equal(sent.at(-1)?.type, "close");
});

test("a socket that dies before any frame does not burn the ticket", async () => {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 1_000, ticketTtlMs: 5_000 });
  const daemon = registry.connectDaemon({ userId: "ada", close: () => undefined, send: (message) => sent.push(message) });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
  const deviceId = registry.listDevices("ada")[0]?.id ?? "";

  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId, agentName: "work" });
  const open = sent[0];
  if (open?.type !== "open") throw new Error("expected open");
  daemon.receive({ type: "opened", sessionId: open.sessionId });
  const result = await pending;
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // ROOT CAUSE:
  //
  // If a framework dials twice for one mount, the ghost socket burned the
  // single-use ticket before the live socket dialed, because the first take
  // deleted the ticket and the first close ended the session.
  //
  // Before the fix, the retake was rejected and the device was told to
  // close. The fix keeps the ticket claimable until a frame flows.
  const ghost = registry.takeTicket(result.ticket, fakeBrowser([]));
  assert.equal(ghost.ok, true);
  if (!ghost.ok) return;
  ghost.link.close();
  assert.ok(!sent.some((message) => message.type === "close"));

  const live = registry.takeTicket(result.ticket, fakeBrowser([]));
  assert.equal(live.ok, true);
  if (!live.ok) return;
  live.link.frame('{"id":1}');
  assert.deepEqual(sent.at(-1), { type: "frame", sessionId: open.sessionId, payload: '{"id":1}' });
  assert.deepEqual(registry.takeTicket(result.ticket, fakeBrowser([])), { ok: false, reason: "used" });
});

test("a second infant take supersedes the first, keeping one live socket", async () => {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 1_000, ticketTtlMs: 5_000 });
  const daemon = registry.connectDaemon({ userId: "ada", close: () => undefined, send: (message) => sent.push(message) });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
  const deviceId = registry.listDevices("ada")[0]?.id ?? "";

  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId, agentName: "work" });
  const open = sent[0];
  if (open?.type !== "open") throw new Error("expected open");
  daemon.receive({ type: "opened", sessionId: open.sessionId });
  const result = await pending;
  assert.equal(result.ok, true);
  if (!result.ok) return;

  let firstClosed = false;
  const first = registry.takeTicket(result.ticket, { send: () => undefined, close: () => { firstClosed = true; } });
  assert.equal(first.ok, true);
  const second = registry.takeTicket(result.ticket, fakeBrowser([]));
  assert.equal(second.ok, true);
  assert.equal(firstClosed, true);
  if (!first.ok || !second.ok) return;
  // The superseded socket is stale: its frames and close are ignored.
  first.link.frame('{"id":9}');
  first.link.close();
  second.link.frame('{"id":1}');
  assert.deepEqual(sent.at(-1), { type: "frame", sessionId: open.sessionId, payload: '{"id":1}' });
});

test("an unknown ticket reports gone", () => {
  const registry = createRegistry();
  assert.deepEqual(registry.takeTicket("no-such-ticket", fakeBrowser([])), { ok: false, reason: "gone" });
});

test("live sessions are listed per account without reading ACP payloads", async () => {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 1_000, ticketTtlMs: 5_000 });
  const ada = registry.connectDaemon({ userId: "ada", close: () => undefined, send: (message) => sent.push(message) });
  ada.receive({ type: "hello", platform: "linux", hostname: "studio", deviceId: "device-studio-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
  const bea = registry.connectDaemon({ userId: "bea", close: () => undefined, send: () => undefined });
  bea.receive({ type: "hello", platform: "linux", hostname: "field", deviceId: "device-field-1", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });
  assert.deepEqual(registry.listSessions("ada"), []);
  const deviceId = registry.listDevices("ada")[0]?.id ?? "";
  const pending = registry.openSession({ userId: "ada", clientId: "notes", deviceId, agentName: "work" });
  const open = sent[0];
  if (open?.type !== "open") throw new Error("expected open");
  ada.receive({ type: "opened", sessionId: open.sessionId });
  const result = await pending;
  assert.equal(result.ok, true);
  assert.deepEqual(registry.listSessions("ada"), [{ deviceId, agentName: "work", agentType: "opencode", clientId: "notes" }]);
  assert.deepEqual(registry.listSessions("bea"), []);
  ada.close();
  assert.deepEqual(registry.listSessions("ada"), []);
});

function fakeBrowser(frames: string[]): BrowserSocket {
  return {
    send(payload) {
      frames.push(payload);
    },
    close() {
      return undefined;
    },
  };
}
