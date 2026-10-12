import type Database from "better-sqlite3";

/** A device the account has signed in, whether or not its daemon is connected now. */
export type StoredDevice = {
  id: string;
  hostname: string;
  createdAt: number;
  lastSeenAt: number;
};

export type DeviceStore = {
  /** Records a device for the account. A device id another account already holds is refused. */
  record(input: { userId: string; deviceId: string; hostname: string; now?: number }): boolean;
  list(userId: string): StoredDevice[];
};

type Row = { id: string; hostname: string; created_at: number; last_seen_at: number };

export function openDeviceStore(database: Database.Database): DeviceStore {
  database.exec(`create table if not exists mukae_device (
    id text primary key,
    user_id text not null,
    hostname text not null,
    created_at integer not null,
    last_seen_at integer not null
  )`);
  database.exec("create index if not exists mukae_device_user on mukae_device (user_id)");
  const upsert = database.prepare(`insert into mukae_device (id, user_id, hostname, created_at, last_seen_at)
    values (@deviceId, @userId, @hostname, @now, @now)
    on conflict (id) do update set hostname = excluded.hostname, last_seen_at = excluded.last_seen_at
    where mukae_device.user_id = excluded.user_id`);
  const select = database.prepare<[string], Row>(
    "select id, hostname, created_at, last_seen_at from mukae_device where user_id = ? order by created_at",
  );
  return {
    record({ userId, deviceId, hostname, now = Date.now() }) {
      return upsert.run({ userId, deviceId, hostname, now }).changes > 0;
    },
    list(userId) {
      return select.all(userId).map((row) => ({
        id: row.id,
        hostname: row.hostname,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      }));
    },
  };
}
