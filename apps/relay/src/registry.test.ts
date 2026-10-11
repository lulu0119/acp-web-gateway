import assert from "node:assert/strict";
import test from "node:test";
import type { RelayMessage } from "@mukae/contract";
import { createRegistry, type BrowserSocket } from "./registry.js";

test("a machine appears only for the account that connected it", () => {
  const registry = createRegistry();
  const ada = registry.connectDaemon({ userId: "ada", send: () => undefined });
  ada.receive({ type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] });
  assert.deepEqual(registry.listMachines("ada"), [
    { id: registry.listMachines("ada")[0]?.id, hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] },
  ]);
  assert.deepEqual(registry.listMachines("bea"), []);
  ada.close();
  assert.deepEqual(registry.listMachines("ada"), []);
});

test("opening a session waits until the machine starts the agent, then the ticket works once", async () => {
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ openTimeoutMs: 1_000, ticketTtlMs: 5_000 });
  const daemon = registry.connectDaemon({ userId: "ada", send: (message) => sent.push(message) });
  daemon.receive({ type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] });
  const machineId = registry.listMachines("ada")[0]?.id ?? "";

  const pending = registry.openSession({ userId: "ada", machineId, agentName: "work" });
  const open = sent[0];
  assert.equal(open?.type, "open");
  if (open?.type !== "open") return;
  daemon.receive({ type: "opened", sessionId: open.sessionId });
  const result = await pending;
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const browserFrames: string[] = [];
  const browser = fakeBrowser(browserFrames);
  const link = registry.takeTicket(result.ticket, browser);
  assert.ok(link);
  daemon.receive({ type: "frame", sessionId: open.sessionId, payload: "{\"id\":1}" });
  assert.deepEqual(browserFrames, ['{"id":1}']);
  link?.frame('{"id":2}');
  assert.deepEqual(sent.at(-1), { type: "frame", sessionId: open.sessionId, payload: '{"id":2}' });
  assert.equal(registry.takeTicket(result.ticket, fakeBrowser([])), undefined);

  const missing = await registry.openSession({ userId: "ada", machineId, agentName: "other" });
  assert.deepEqual(missing, { ok: false, status: 404, message: "That agent is not configured on the machine." });
});

test("a ticket that nobody claims ends the session", async () => {
  let clock = 0;
  const sent: RelayMessage[] = [];
  const registry = createRegistry({ now: () => clock, openTimeoutMs: 50, ticketTtlMs: 10 });
  const daemon = registry.connectDaemon({ userId: "ada", send: (message) => sent.push(message) });
  daemon.receive({ type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] });
  const machineId = registry.listMachines("ada")[0]?.id ?? "";
  const pending = registry.openSession({ userId: "ada", machineId, agentName: "work" });
  const open = sent[0];
  if (open?.type !== "open") throw new Error("expected open");
  daemon.receive({ type: "opened", sessionId: open.sessionId });
  const result = await pending;
  assert.equal(result.ok, true);
  if (!result.ok) return;
  clock = 11;
  assert.equal(registry.takeTicket(result.ticket, fakeBrowser([])), undefined);
  assert.equal(sent.at(-1)?.type, "close");
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
