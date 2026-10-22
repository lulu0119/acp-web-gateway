import assert from "node:assert/strict";
import { test } from "vitest";
import { agentSocketPath, attachCloseCodes, closeReason, deviceCloseCodes, deviceSocketPath, parseDeviceMessage, parseRelayMessage, relayWebSocketUrl } from "./index.js";

const connectionId = "tN3rXk0qZ1m9Wc2yPb7aHg";

test("a hello names the device's hostname, its working directory, its platform, and its agents", () => {
  const hello = {
    type: "hello" as const,
    hostname: "studio",
    workingDirectory: "C:\Users\person\.local\share\exterior\workspace",
    platform: "macos" as const,
    agents: [{ name: "work", agentType: "opencode" }],
  };
  assert.deepEqual(parseDeviceMessage(hello), { ok: true, message: hello });
  assert.deepEqual(parseDeviceMessage({ ...hello, extra: "ignored" }), { ok: true, message: hello });
  for (const broken of [
    { ...hello, hostname: "" },
    { ...hello, agents: [{ name: "work", agentType: "OpenCode" }] },
    { ...hello, workingDirectory: "" },
    { ...hello, platform: "darwin" },
  ]) {
    assert.deepEqual(parseDeviceMessage(broken), { ok: false, reason: "invalid" });
  }
});

test("open and open_failed name an unguessable connection id, and an unknown message type is not an error", () => {
  assert.deepEqual(parseRelayMessage({ type: "open", connectionId, agentName: "work" }), {
    ok: true,
    message: { type: "open", connectionId, agentName: "work" },
  });
  assert.deepEqual(parseRelayMessage({ type: "open", connectionId: "short", agentName: "work" }), { ok: false, reason: "invalid" });
  assert.deepEqual(parseDeviceMessage({ type: "open_failed", connectionId, message: "No such agent." }).ok, true);
  assert.deepEqual(parseDeviceMessage({ type: "stats", connectionId }), { ok: false, reason: "unknown" });
  assert.deepEqual(parseRelayMessage({ type: "frame", connectionId, payload: "{}" }), { ok: false, reason: "unknown" });
  assert.deepEqual(parseDeviceMessage("hello"), { ok: false, reason: "invalid" });
});

test("close codes name their condition", () => {
  assert.equal(closeReason(attachCloseCodes, 4100), "ticket_rejected");
  assert.equal(closeReason(deviceCloseCodes, 4201), "revoked");
  assert.equal(closeReason(attachCloseCodes, 1000), undefined);
});

test("sockets use the relay origin, and each connection has its own agent socket address", () => {
  assert.equal(relayWebSocketUrl("http://127.0.0.1:8787", deviceSocketPath), "ws://127.0.0.1:8787/eap/v1/device");
  assert.equal(relayWebSocketUrl("https://exterior.example", agentSocketPath(connectionId)), `wss://exterior.example/eap/v1/device/connections/${connectionId}`);
});
