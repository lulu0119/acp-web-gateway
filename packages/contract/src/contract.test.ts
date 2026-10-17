import assert from "node:assert/strict";
import { test } from "vitest";
import { devicePlatform, parseDaemonMessage, parseRelayMessage, relayWebSocketUrl } from "./index.js";

test("a daemon hello names the device, its working directory, and its agent configurations", () => {
  const hello = {
    type: "hello",
    hostname: "studio",
    deviceId: "device-studio-1",
    workingDirectory: "C:\\Users\\person\\.local\\share\\exterior\\workspace",
    agents: [{ name: "work", agentType: "opencode" }],
  };
  assert.deepEqual(parseDaemonMessage(hello), hello);
  assert.equal(parseDaemonMessage({ ...hello, hostname: "" }), undefined);
  assert.equal(parseDaemonMessage({ ...hello, agents: [{ name: "work", agentType: "OpenCode" }] }), undefined);
  assert.equal(parseDaemonMessage({ ...hello, workingDirectory: "" }), undefined);
  assert.equal(parseDaemonMessage({ ...hello, deviceId: undefined }), undefined);
  assert.equal(parseDaemonMessage({ type: "hello", hostname: "studio", agents: [] }), undefined);
});

test("a hello may name the device's platform, from a short list", () => {
  const hello = {
    type: "hello",
    hostname: "studio",
    deviceId: "device-studio-1",
    workingDirectory: "/home/person/workspace",
    agents: [],
  };
  assert.deepEqual(parseDaemonMessage({ ...hello, platform: "macos" }), { ...hello, platform: "macos" });
  assert.equal(parseDaemonMessage({ ...hello, platform: "darwin" }), undefined);
  assert.equal(devicePlatform("darwin"), "macos");
  assert.equal(devicePlatform("win32"), "windows");
  assert.equal(devicePlatform("linux"), "linux");
  assert.equal(devicePlatform("freebsd"), undefined);
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
  assert.equal(relayWebSocketUrl("https://exterior.example", "/api/daemon"), "wss://exterior.example/api/daemon");
});
