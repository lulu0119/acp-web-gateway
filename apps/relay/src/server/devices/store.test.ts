import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { test } from "vitest";
import { openDeviceStore } from "./store.js";

test("a device keeps the platform its daemon last reported, and loses it to a daemon that reports none", () => {
  const devices = openDeviceStore(new Database(":memory:"));
  devices.record({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", now: 1 });
  assert.equal(devices.list("ada")[0]?.platform, undefined);
  devices.touch({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", platform: "macos", now: 2 });
  assert.equal(devices.list("ada")[0]?.platform, "macos");
  devices.record({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", now: 3 });
  assert.equal(devices.list("ada")[0]?.platform, "macos");
  devices.touch({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", now: 4 });
  assert.equal(devices.list("ada")[0]?.platform, undefined);
});

test("a relay whose device table predates platforms gains the column", () => {
  const database = new Database(":memory:");
  database.exec(`create table exterior_device (
    id text primary key, user_id text not null, hostname text not null, created_at integer not null, last_seen_at integer not null
  )`);
  database.exec("insert into exterior_device values ('device-studio-1', 'ada', 'studio', 1, 1)");
  const devices = openDeviceStore(database);
  assert.deepEqual(devices.list("ada"), [{ id: "device-studio-1", hostname: "studio", createdAt: 1, lastSeenAt: 1 }]);
  devices.touch({ userId: "ada", deviceId: "device-studio-1", hostname: "studio", platform: "linux", now: 2 });
  assert.equal(devices.list("ada")[0]?.platform, "linux");
});
