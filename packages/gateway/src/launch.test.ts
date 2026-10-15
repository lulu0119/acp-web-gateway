import assert from "node:assert/strict";
import { spawnSync, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "vitest";
import { resolveCommand, startProcess } from "./launch.js";

const onWindows = process.platform === "win32";

test("a name resolves to the file this machine starts, and a batch script is not an image", async () => {
  const directory = await fixture({
    opencode: "#!/bin/sh\n",
    "kimi.CMD": "@echo off\n",
    "claude.EXE": "",
    "notes.txt": "",
  });
  await chmod(join(directory, "opencode"), 0o755);
  const unix = { windows: false, pathValue: directory };
  const windows = { windows: true, pathExt: ".COM;.EXE;.BAT;.CMD", pathValue: directory };
  assert.deepEqual(resolveCommand("opencode", unix), { kind: "image", path: join(directory, "opencode") });
  assert.deepEqual(resolveCommand("kimi", windows), { kind: "batch", path: join(directory, "kimi.CMD") });
  assert.deepEqual(resolveCommand("claude", windows), { kind: "image", path: join(directory, "claude.EXE") });
  assert.deepEqual(resolveCommand("claude.EXE", windows), { kind: "image", path: join(directory, "claude.EXE") });
  // Windows cannot start a file that is neither a PE image nor a script.
  assert.equal(resolveCommand("notes.txt", windows), undefined);
  assert.equal(resolveCommand("missing", windows), undefined);
  assert.equal(resolveCommand("opencode", windows), undefined);
});

test("an explicit path is taken as written", async () => {
  const directory = await fixture({ "opencode.exe": "" });
  const file = join(directory, "opencode.exe");
  assert.deepEqual(resolveCommand(file, { windows: true, pathValue: "" }), { kind: "image", path: file });
  assert.equal(resolveCommand(join(directory, "missing.exe"), { windows: true, pathValue: "" }), undefined);
});

// A name with no extension is looked up again with the extensions Windows
// starts, which is how an npm install answers to `opencode`.
test.skipIf(!onWindows)("a Windows name finds the .cmd an npm install writes", () => {
  const found = resolveCommand("npx");
  assert.equal(found?.kind, "batch");
  assert.equal(found?.path.toLowerCase(), join(dirname(process.execPath), "npx.cmd").toLowerCase());
});

test("a batch argument that a command interpreter would read is refused", async () => {
  const directory = await fixture({ "agent.cmd": "@echo off\r\n" });
  const executable = { kind: "batch" as const, path: join(directory, "agent.cmd") };
  for (const argument of ["--flag&echo", "%USERNAME%", "a^b", "a|b"]) {
    assert.throws(
      () => startProcess({ executable, args: [argument], env: process.env, workingDirectory: directory }),
      /cannot be passed to a batch command/,
      argument,
    );
  }
});

test.skipIf(!onWindows)("a batch agent takes a scoped package name and its arguments", async () => {
  const directory = await fixture({ "agent.cmd": "@echo off\r\necho %*\r\n" });
  const started = startProcess({
    executable: { kind: "batch", path: join(directory, "agent.cmd") },
    args: ["-y", "@scope/name", "--flag"],
    env: process.env,
    workingDirectory: directory,
  });
  const output = await collect(started.child);
  started.stop(() => undefined);
  assert.equal(output.trim(), '-y @scope/name --flag');
});

// A batch script is only ever the parent of the agent, so a stop has to reach
// past it. This agent ignores its input ending, so the stop waits out the grace
// period before ending the tree.
test.skipIf(!onWindows)("a stop ends the tree behind a batch script", { timeout: 15_000 }, async () => {
  const directory = await fixture({
    "agent.cmd": `@echo off\r\n"${process.execPath}" -e "setTimeout(() => {}, 60000)"\r\n`,
  });
  const started = startProcess({
    executable: { kind: "batch", path: join(directory, "agent.cmd") },
    args: [],
    env: process.env,
    workingDirectory: directory,
  });
  const agent = await waitForGrandchild(started.child.pid);
  await new Promise<void>((resolve) => started.stop(resolve));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(isAlive(agent), false);
});

// An image never meets cmd.exe, so its arguments arrive as they are.
test("an image agent takes arguments that a command interpreter would read", async () => {
  const script = "process.stdout.write(process.argv.slice(1).join(' '))";
  const executable = resolveCommand(process.execPath);
  assert.ok(executable);
  const started = startProcess({
    executable,
    args: ["-e", script, "--", "-y", "@scope/name", "--flag&echo", "%USERNAME%"],
    env: process.env,
    workingDirectory: process.cwd(),
  });
  const output = await collect(started.child);
  started.stop(() => undefined);
  assert.equal(output, "-y @scope/name --flag&echo %USERNAME%");
});

async function fixture(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "exterior-launch-"));
  for (const [name, text] of Object.entries(files)) await writeFile(join(directory, name), text, "utf8");
  return directory;
}

function collect(child: ChildProcess): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", () => resolve(output));
  });
}

async function waitForGrandchild(parentPid: number | undefined): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = grandchildOf(parentPid);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The batch script did not start an agent.");
}

/** The agent a batch script started: the process whose parent is the script's shell. */
function grandchildOf(parentPid: number | undefined): number | undefined {
  if (parentPid === undefined) return undefined;
  const listed = spawnSync(
    "pwsh",
    ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${parentPid}").ProcessId`],
    { encoding: "utf8", windowsHide: true },
  );
  const pid = Number((listed.stdout ?? "").trim().split("\n")[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function isAlive(pid: number): boolean {
  const listed = spawnSync("tasklist", ["/fi", `PID eq ${pid}`, "/nh"], { encoding: "utf8", windowsHide: true });
  return (listed.stdout ?? "").includes(String(pid));
}
