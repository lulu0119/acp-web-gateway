import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commandOnPath, firstMissingCommand, parseLoginPath } from "./launch-path.js";

test("a command name resolves to an executable directory on PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "mukae-path-"));
  const binary = join(root, "opencode");
  await writeFile(binary, "#!/bin/sh\n");
  await chmod(binary, 0o755);
  assert.equal(commandOnPath("opencode", `/missing:${root}`), binary);
  assert.equal(commandOnPath("/usr/bin/true", root), "/usr/bin/true");
  assert.equal(commandOnPath("missing", root), "missing");
  assert.equal(firstMissingCommand(["opencode", "npx"], `/missing:${root}`), "npx");
  assert.equal(firstMissingCommand(["opencode"], `/missing:${root}`), undefined);
});

test("login path output ignores shell noise and keeps the path line", () => {
  const output = "gitstatus failed\n/usr/bin:/opt/homebrew/bin\n";
  assert.equal(parseLoginPath(output), "/usr/bin:/opt/homebrew/bin");
  assert.equal(parseLoginPath("no path here"), "");
});
