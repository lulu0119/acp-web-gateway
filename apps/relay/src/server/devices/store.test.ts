import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { test } from "vitest";
import { openDeviceStore } from "./store.js";

test("a device keeps the platform it last reported", () => {
  const devices = openDeviceStore(new Database(":memory:"));
  devices.record({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", now: 1 });
  assert.equal(devices.list("ada")[0]?.platform, undefined);
  devices.record({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", platform: "macos", now: 2 });
  assert.equal(devices.list("ada")[0]?.platform, "macos");
  devices.record({ userId: "ada", deviceId: "device-studio-1", hostname: "studio-renamed", now: 3 });
  assert.deepEqual(devices.list("ada").map(({ hostname, platform, createdAt, lastSeenAt }) => ({ hostname, platform, createdAt, lastSeenAt })), [
    { hostname: "studio-renamed", platform: "macos", createdAt: 1, lastSeenAt: 3 },
  ]);
});

test("one key signed in to two accounts is a device of each", () => {
  const devices = openDeviceStore(new Database(":memory:"));
  devices.record({ userId: "ada", deviceId: "device-shared-1", hostname: "studio" });
  devices.record({ userId: "bea", deviceId: "device-shared-1", hostname: "studio" });
  assert.equal(devices.remove({ userId: "bea", deviceId: "device-shared-1" }), true);
  assert.deepEqual(devices.list("ada").map((device) => device.id), ["device-shared-1"]);
  assert.deepEqual(devices.list("bea"), []);
});
