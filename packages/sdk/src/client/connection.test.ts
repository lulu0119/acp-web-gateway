import assert from "node:assert/strict";
import { test } from "vitest";
import { createAgentConnector } from "./connection.js";
import type { OpenedAgent } from "./oauth.js";

test("concurrent opens share one ticket post", async () => {
  let posts = 0;
  const connector = createAgentConnector({
    relayUrl: "https://relay.example.test",
    accessToken: "token",
    target: { deviceId: "device-m1", agentName: "work" },
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
    target: { deviceId: "device-m1", agentName: "work" },
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
    target: { deviceId: "device-m1", agentName: "work" },
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

function opened(n: number): OpenedAgent {
  return { url: `wss://relay.example.test/api/acp?ticket=ticket-${n}`, agentType: "opencode", expiresAt: "2026-10-21T08:00:00Z" };
}
