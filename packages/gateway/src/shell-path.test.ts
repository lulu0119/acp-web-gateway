import assert from "node:assert/strict";
import { delimiter } from "node:path";
import { test } from "vitest";
import { loginShellPath, mergePath } from "./shell-path.js";

const join = (...entries: string[]) => entries.join(delimiter);

test("the login shell's PATH goes first and keeps entries only it lacks", async () => {
  const seen: string[][] = [];
  const path = await loginShellPath({
    env: { SHELL: "/bin/zsh", PATH: join("/usr/bin", "/bin") },
    platform: "darwin",
    run: async (shell, args) => {
      seen.push([shell, ...args]);
      return `Welcome back!\n__EXTERIOR_PATH__${join("/opt/homebrew/bin", "/usr/bin")}__EXTERIOR_PATH__`;
    },
  });
  assert.equal(path, join("/opt/homebrew/bin", "/usr/bin", "/bin"));
  assert.equal(seen[0]?.[0], "/bin/zsh");
  assert.equal(seen[0]?.[1], "-ilc");
});

test("nothing changes on Windows, when the shell fails, or when it adds nothing", async () => {
  const env = { SHELL: "/bin/bash", PATH: join("/usr/bin", "/bin") };
  assert.equal(await loginShellPath({ env, platform: "win32", run: async () => assert.fail("ran a shell") }), undefined);
  assert.equal(await loginShellPath({ env, platform: "linux", run: async () => Promise.reject(new Error("timed out")) }), undefined);
  assert.equal(await loginShellPath({ env, platform: "linux", run: async () => `__EXTERIOR_PATH__/usr/bin__EXTERIOR_PATH__` }), undefined);
  assert.equal(await loginShellPath({ env, platform: "linux", run: async () => "no markers" }), undefined);
});

test("merging drops empty and repeated entries", () => {
  assert.equal(mergePath(join("/a", "", "/b"), join("/b", "/c", "/a")), join("/a", "/b", "/c"));
});
