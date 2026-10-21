import { devicePlatforms, type DevicePlatform } from "@exterioragentprotocol/sdk";
import type Database from "better-sqlite3";

/** A device the account has signed in, whether or not it is connected now. */
export type StoredDevice = {
  id: string;
  hostname: string;
  /** The operating system the device last reported. Absent until it has connected. */
  platform?: DevicePlatform;
  createdAt: number;
  lastSeenAt: number;
};

/**
 * The devices each account has seen connect. A device id is the thumbprint of the device's key, so one computer
 * signed in to two accounts with one key is a device of each.
 */
export type DeviceStore = {
  /** Lists the device for the account, or updates it. A missing platform leaves the one already stored. */
  record(input: { userId: string; deviceId: string; hostname: string; platform?: DevicePlatform; now?: number }): void;
  /** Answers false when the account has no such device. */
  remove(input: { userId: string; deviceId: string }): boolean;
  list(userId: string): StoredDevice[];
};

type Row = { id: string; hostname: string; platform: string | null; created_at: number; last_seen_at: number };

export function openDeviceStore(database: Database.Database): DeviceStore {
  database.exec(`create table if not exists eap_device (
    user_id text not null,
    id text not null,
    hostname text not null,
    platform text,
    created_at integer not null,
    last_seen_at integer not null,
    primary key (user_id, id)
  )`);
  const upsert = database.prepare(`insert into eap_device (user_id, id, hostname, platform, created_at, last_seen_at)
    values (@userId, @deviceId, @hostname, @platform, @now, @now)
    on conflict (user_id, id) do update set hostname = excluded.hostname,
      platform = coalesce(excluded.platform, eap_device.platform), last_seen_at = excluded.last_seen_at`);
  const forget = database.prepare("delete from eap_device where id = @deviceId and user_id = @userId");
  const select = database.prepare<[string], Row>(
    "select id, hostname, platform, created_at, last_seen_at from eap_device where user_id = ? order by created_at",
  );
  return {
    record({ userId, deviceId, hostname, platform, now = Date.now() }) {
      upsert.run({ userId, deviceId, hostname, platform: platform ?? null, now });
    },
    remove({ userId, deviceId }) {
      return forget.run({ userId, deviceId }).changes > 0;
    },
    list(userId) {
      return select.all(userId).map((row) => ({
        id: row.id,
        hostname: row.hostname,
        ...(isPlatform(row.platform) ? { platform: row.platform } : {}),
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      }));
    },
  };
}

function isPlatform(value: string | null): value is DevicePlatform {
  return (devicePlatforms as readonly (string | null)[]).includes(value);
}
