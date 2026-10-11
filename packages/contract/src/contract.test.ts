import assert from "node:assert/strict";
import test from "node:test";
import { parseDaemonMessage, parseRelayMessage, relayWebSocketUrl } from "./index.js";

test("a daemon hello names the machine and its agent configurations", () => {
  assert.deepEqual(
    parseDaemonMessage({
      type: "hello",
      hostname: "studio",
      agents: [{ name: "work", agentType: "opencode" }],
    }),
    { type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] },
  );
  assert.equal(parseDaemonMessage({ type: "hello", hostname: "", agents: [] }), undefined);
  assert.equal(parseDaemonMessage({ type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "OpenCode" }] }), undefined);
});

test("frames and session ids cross the relay unchanged", () => {
  const frame = { type: "frame", sessionId: "session-1", payload: "{\"id\":1}" };
  assert.deepEqual(parseDaemonMessage(frame), frame);
  assert.deepEqual(parseRelayMessage(frame), frame);
  assert.deepEqual(parseRelayMessage({ type: "open", sessionId: "session-1", agentName: "work" }), {
    type: "open",
    sessionId: "session-1",
    agentName: "work",
  });
  assert.equal(parseRelayMessage({ type: "open", sessionId: "short", agentName: "work" }), undefined);
  assert.equal(parseDaemonMessage({ type: "opened", sessionId: "session-1" })?.type, "opened");
});

test("the browser socket uses the relay origin", () => {
  assert.equal(relayWebSocketUrl("http://127.0.0.1:8787", "/api/acp"), "ws://127.0.0.1:8787/api/acp");
  assert.equal(relayWebSocketUrl("https://mukae.example", "/api/daemon"), "wss://mukae.example/api/daemon");
});
