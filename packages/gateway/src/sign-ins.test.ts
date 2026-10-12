import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { chooseRelay, parseSignIn, readSignIn, readSignIns, removeSignIn, writeSignIn } from "./sign-ins.js";

const local = { relayUrl: "http://127.0.0.1:8787", accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 1_700_000_000_000 };
const hosted = { relayUrl: "https://mukae.example", accessToken: "access-2", refreshToken: "refresh-2", expiresAt: 1_700_000_000_000 };

test("a sign-in is private and kept per relay", async () => {
  const home = await mkdtemp(join(tmpdir(), "mukae-sign-in-"));
  await writeSignIn({ ...local, relayUrl: "http://127.0.0.1:8787/ignored" }, home);
  await writeSignIn(hosted, home);
  await writeSignIn({ ...hosted, refreshToken: "refresh-3" }, home);
  const directory = join(home, ".config", "mukae", "sign-ins");
  assert.deepEqual((await readdir(directory)).sort(), ["http_127.0.0.1_8787.json", "https_mukae.example.json"]);
  if (process.platform !== "win32") assert.equal((await stat(join(directory, "https_mukae.example.json"))).mode & 0o777, 0o600);
  assert.deepEqual(await readSignIn("http://127.0.0.1:8787", home), local);
  assert.deepEqual(await readSignIns(home), [local, { ...hosted, refreshToken: "refresh-3" }]);
  await removeSignIn("https://mukae.example", home);
  assert.deepEqual(await readSignIns(home), [local]);
  assert.equal(parseSignIn({ accessToken: "x" }), undefined);
});

test("the single daemon-session.json from before becomes a sign-in", async () => {
  const home = await mkdtemp(join(tmpdir(), "mukae-sign-in-"));
  await mkdir(join(home, ".config", "mukae"), { recursive: true });
  await writeFile(join(home, ".config", "mukae", "daemon-session.json"), JSON.stringify(hosted));
  assert.deepEqual(await readSignIns(home), [hosted]);
  assert.deepEqual(await readdir(join(home, ".config", "mukae")), ["sign-ins"]);
});

test("a requested relay wins, one sign-in is the default, and several are ambiguous", () => {
  assert.deepEqual(chooseRelay({ requested: "https://other.example", signedIn: [local, hosted], command: "daemon" }), {
    ok: true,
    relayUrl: "https://other.example",
  });
  assert.deepEqual(chooseRelay({ signedIn: [hosted], command: "daemon" }), { ok: true, relayUrl: "https://mukae.example" });
  assert.deepEqual(chooseRelay({ signedIn: [], command: "daemon" }), {
    ok: false,
    message: "This device is not signed in. Run mukae login --relay <url>.",
  });
  assert.deepEqual(chooseRelay({ signedIn: [local, hosted], command: "daemon" }), {
    ok: false,
    message: [
      "This device is signed in to 2 relays. Pick one:",
      "  mukae daemon --relay http://127.0.0.1:8787",
      "  mukae daemon --relay https://mukae.example",
    ].join("\n"),
  });
});
