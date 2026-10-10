import assert from "node:assert/strict";
import test from "node:test";
import { parseLaunchUrl } from "@mukae/contract";
import { runConnect } from "./connect.js";

test("unreachable status eventually selects the explain page", async () => {
  let now = 0;
  const visits: string[] = [];
  const launched: string[] = [];
  const outcome = await runConnect({
    documentationUrl: "https://docs.example/explain",
    agentType: "opencode",
    port: 47321,
    readyTimeoutMs: 500,
    origin: "https://app.example",
    createNonce: () => "nonce-1234",
    openLaunchUrl: (url) => launched.push(url),
    readStatus: async () => "unreachable",
    goToDocumentation: (url) => visits.push(url),
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    now: () => now,
  });
  assert.equal(outcome.connected, false);
  if (!outcome.connected) assert.equal(outcome.reason, "not_ready");
  assert.deepEqual(visits, ["https://docs.example/explain"]);
  assert.equal(launched.length, 1);
  assert.deepEqual(parseLaunchUrl(launched[0] ?? ""), {
    nonce: "nonce-1234",
    origin: "https://app.example",
    agentType: "opencode",
    port: 47321,
  });
});

test("waiting status returns the websocket url without leaving the page", async () => {
  const visits: string[] = [];
  const outcome = await runConnect({
    documentationUrl: "https://docs.example/explain",
    agentType: "opencode",
    port: 9,
    readyTimeoutMs: 60_000,
    origin: "http://127.0.0.1:47100",
    createNonce: () => "nonce-1234",
    openLaunchUrl: () => {},
    readStatus: async () => "waiting",
    goToDocumentation: (url) => visits.push(url),
    sleep: async () => {},
    now: () => 0,
  });
  assert.deepEqual(outcome, { connected: true, url: "ws://127.0.0.1:9/acp?nonce=nonce-1234" });
  assert.deepEqual(visits, []);
});

test("an unconfigured type does not open the explain page", async () => {
  const visits: string[] = [];
  const outcome = await runConnect({
    documentationUrl: "https://docs.example/explain",
    agentType: "opencode",
    port: 9,
    readyTimeoutMs: 60_000,
    origin: "https://app.example",
    createNonce: () => "nonce-1234",
    openLaunchUrl: () => {},
    readStatus: async () => "unconfigured",
    goToDocumentation: (url) => visits.push(url),
    sleep: async () => {},
    now: () => 0,
  });
  assert.deepEqual(outcome, { connected: false, reason: "unconfigured" });
  assert.deepEqual(visits, []);
});

test("a local choice keeps the page in place until the gateway is waiting", async () => {
  let now = 0;
  const outcome = await runConnect({
    documentationUrl: "https://docs.example/explain",
    agentType: "opencode",
    port: 9,
    readyTimeoutMs: 500,
    origin: "https://app.example",
    createNonce: () => "nonce-1234",
    openLaunchUrl: () => {},
    readStatus: async () => (now < 1_000 ? "choosing" : "waiting"),
    goToDocumentation: () => {
      throw new Error("explain page opened during choice");
    },
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    now: () => now,
  });
  assert.deepEqual(outcome, { connected: true, url: "ws://127.0.0.1:9/acp?nonce=nonce-1234" });
});
