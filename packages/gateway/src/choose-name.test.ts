import assert from "node:assert/strict";
import test from "node:test";
import { systemDialogCommand } from "./choose-name.js";

test("the name dialog receives configuration names as arguments, not inside the script", () => {
  const invocation = systemDialogCommand("opencode", ["work", "O'Hare"]);
  assert.equal(invocation.command, "osascript");
  assert.equal(invocation.args[0], "-e");
  assert.equal(invocation.args[1]?.includes("work"), false);
  assert.equal(invocation.args[1]?.includes("O'Hare"), false);
  assert.deepEqual(invocation.args.slice(2), ["--", "opencode", "work", "O'Hare"]);
});
