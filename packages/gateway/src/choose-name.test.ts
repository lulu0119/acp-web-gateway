import assert from "node:assert/strict";
import test from "node:test";
import { chooseNameFromSystemDialog, systemDialogCommand } from "./choose-name.js";

test("the name dialog receives configuration names as arguments, not inside the script", () => {
  const invocation = systemDialogCommand("opencode", ["work", "O'Hare"]);
  assert.equal(invocation.command, "osascript");
  assert.equal(invocation.args[0], "-e");
  assert.equal(invocation.args[1]?.includes("work"), false);
  assert.equal(invocation.args[1]?.includes("O'Hare"), false);
  assert.deepEqual(invocation.args.slice(2), ["--", "opencode", "work", "O'Hare"]);
});

test("a dialog that does not return cancels the choice", async () => {
  let timeoutMs = 0;
  const chosen = await chooseNameFromSystemDialog("opencode", ["work"], 50, async (_command, _args, timeout) => {
    timeoutMs = timeout;
    throw new Error("timed out");
  });
  assert.equal(timeoutMs, 50);
  assert.equal(chosen, undefined);
});

test("the dialog returns a name only when it was offered", async () => {
  assert.equal(
    await chooseNameFromSystemDialog("opencode", ["work"], 5_000, async () => ({ stdout: "work\n" })),
    "work",
  );
  assert.equal(
    await chooseNameFromSystemDialog("opencode", ["work"], 5_000, async () => ({ stdout: "other\n" })),
    undefined,
  );
});
