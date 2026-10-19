import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { test } from "vitest";
import { openDeviceStore } from "./store.js";

test("a device keeps the platform its daemon last reported", () => {
  const devices = openDeviceStore(new Database(":memory:"));
  devices.record({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", now: 1 });
  assert.equal(devices.list("ada")[0]?.platform, undefined);
  devices.touch({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", platform: "macos", now: 2 });
  assert.equal(devices.list("ada")[0]?.platform, "macos");
  devices.record({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", now: 3 });
  assert.equal(devices.list("ada")[0]?.platform, "macos");
  devices.touch({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", now: 4 });
  assert.equal(devices.list("ada")[0]?.platform, "macos");
});
