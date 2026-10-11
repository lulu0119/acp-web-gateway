import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createAgentConnector,
  needsFreshTicket,
  parseTicketCloseReason,
  type OpenedAgent,
} from "./connection.js";

test("concurrent opens share one ticket post", async () => {
  let posts = 0;
  const connector = createAgentConnector({
    relayUrl: "https://relay.example.test",
    accessToken: "token",
    target: { machineId: "m1", agentName: "work" },
    open: async () => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return opened(posts);
    },
  });
  const [first, second] = await Promise.all([connector.open(), connector.open()]);
  assert.equal(posts, 1);
  assert.deepEqual(first, second);
});

test("sequential opens mint fresh tickets, never resuming", async () => {
  let posts = 0;
  const connector = createAgentConnector({
    relayUrl: "https://relay.example.test",
    accessToken: "token",
    target: { machineId: "m1", agentName: "work" },
    open: async () => {
      posts += 1;
      return opened(posts);
    },
  });
  const first = await connector.open();
  const second = await connector.open();
  assert.equal(posts, 2);
  assert.notEqual(first.url, second.url);
});

test("reopen abandons the queue and mints a fresh ticket", async () => {
  let posts = 0;
  const connector = createAgentConnector({
    relayUrl: "https://relay.example.test",
    accessToken: "token",
    target: { machineId: "m1", agentName: "work" },
    open: async () => {
      posts += 1;
      return opened(posts);
    },
  });
  await connector.open();
  const fresh = await connector.reopen();
  assert.equal(posts, 2);
  assert.ok(fresh.url.includes("ticket-2"));
});

test("every ticket outcome wants a fresh ticket, protocol errors do not", () => {
  assert.equal(parseTicketCloseReason("ticket-used"), "ticket-used");
  assert.equal(parseTicketCloseReason("ticket-expired"), "ticket-expired");
  assert.equal(parseTicketCloseReason("ticket-gone"), "ticket-gone");
  assert.equal(parseTicketCloseReason("ticket"), undefined);
  assert.equal(parseTicketCloseReason(undefined), undefined);
  assert.equal(needsFreshTicket("ticket-expired"), true);
  assert.equal(needsFreshTicket("message"), false);
  assert.equal(needsFreshTicket(undefined), false);
});

function opened(n: number): OpenedAgent {
  return { url: `wss://relay.example.test/api/acp?ticket=ticket-${n}`, agentType: "opencode", agentName: "work" };
}
