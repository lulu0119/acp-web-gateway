import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDaemonSession, readDaemonSession, writeDaemonSession } from "./daemon-session.js";

test("a daemon session is private to the account directory", async () => {
  const home = await mkdtemp(join(tmpdir(), "mukae-session-"));
  const session = {
    relayUrl: "http://127.0.0.1:8787/ignored",
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: 1_700_000_000_000,
  };
  await writeDaemonSession(session, home);
  const info = await stat(join(home, ".config", "mukae", "daemon-session.json"));
  assert.equal(info.mode & 0o777, 0o600);
  assert.deepEqual(await readDaemonSession(home), { ...session, relayUrl: "http://127.0.0.1:8787" });
  assert.equal(parseDaemonSession({ accessToken: "x" }), undefined);
  const text = await readFile(join(home, ".config", "mukae", "daemon-session.json"), "utf8");
  assert.match(text, /refresh-1/);
});
