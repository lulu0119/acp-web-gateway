import assert from "node:assert/strict";
import { test } from "vitest";
import { attachCloseCodes, closeReason, deviceCloseCodes, parseDaemonMessage, parseRelayMessage, relayWebSocketUrl } from "./index.js";

const connectionId = "tN3rXk0qZ1m9Wc2yPb7aHg";

test("a daemon hello names its version, the device, its working directory, its platform, and its agent configurations", () => {
  const hello = {
    type: "hello" as const,
    protocolVersion: 1,
    hostname: "studio",
    deviceId: "device-studio-1",
    workingDirectory: "C:\\Users\\person\\.local\\share\\exterior\\workspace",
    platform: "macos" as const,
    agents: [{ name: "work", agentType: "opencode" }],
  };
  assert.deepEqual(parseDaemonMessage(hello), { ok: true, message: hello });
  assert.deepEqual(parseDaemonMessage({ ...hello, extra: "ignored" }), { ok: true, message: hello });
  for (const broken of [
    { ...hello, hostname: "" },
    { ...hello, agents: [{ name: "work", agentType: "OpenCode" }] },
    { ...hello, workingDirectory: "" },
    { ...hello, deviceId: undefined },
    { ...hello, protocolVersion: undefined },
    { ...hello, platform: "darwin" },
  ]) {
    assert.deepEqual(parseDaemonMessage(broken), { ok: false, reason: "invalid" });
  }
});

test("frames and connection ids cross the relay unchanged, and an unknown message type is not an error", () => {
  const frame = { type: "frame", connectionId, payload: "{\"id\":1}" };
  assert.deepEqual(parseDaemonMessage(frame), { ok: true, message: frame });
  assert.deepEqual(parseRelayMessage(frame), { ok: true, message: frame });
  assert.deepEqual(parseRelayMessage({ type: "open", connectionId, agentName: "work" }), {
    ok: true,
    message: { type: "open", connectionId, agentName: "work" },
  });
  assert.deepEqual(parseRelayMessage({ type: "open", connectionId: "short", agentName: "work" }), { ok: false, reason: "invalid" });
  assert.deepEqual(parseDaemonMessage({ type: "open_failed", connectionId, message: "No such agent." }).ok, true);
  assert.deepEqual(parseDaemonMessage({ type: "stats", connectionId }), { ok: false, reason: "unknown" });
  assert.deepEqual(parseDaemonMessage("hello"), { ok: false, reason: "invalid" });
});

test("close codes name their condition", () => {
  assert.equal(closeReason(attachCloseCodes, 4100), "ticket_rejected");
  assert.equal(closeReason(deviceCloseCodes, 4201), "revoked");
  assert.equal(closeReason(attachCloseCodes, 1000), undefined);
});

test("the browser socket uses the relay origin", () => {
  assert.equal(relayWebSocketUrl("http://127.0.0.1:8787", "/api/acp"), "ws://127.0.0.1:8787/api/acp");
  assert.equal(relayWebSocketUrl("https://exterior.example", "/api/daemon"), "wss://exterior.example/api/daemon");
});
