import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "vitest";
import {
  configFilePath,
  configuredWorkingDirectory,
  defaultConfigText,
  parseGatewayConfig,
  readGatewayConfig,
  readGatewayConfigForWrite,
  usableWorkingDirectory,
  watchGatewayConfig,
  workingDirectoryPath,
  writeGatewayConfig,
} from "./config.js";

test("the working directory is the device data directory unless the configuration names one", () => {
  assert.equal(workingDirectoryPath("/home/person"), join("/home/person", ".local", "share", "exterior", "workspace"));
  assert.equal(configuredWorkingDirectory({ agents: [] }, "/home/person"), join("/home/person", ".local", "share", "exterior", "workspace"));
  assert.equal(configuredWorkingDirectory({ agents: [], workingDirectory: "/mine" }, "/home/person"), "/mine");
});

test("a working directory is stored and written back with the agents", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  await writeGatewayConfig({ agents: [{ name: "work", agentType: "opencode", env: {} }], workingDirectory: "/projects/mine" }, homeDirectory);
  assert.deepEqual(await readGatewayConfig(homeDirectory), {
    agents: [{ name: "work", agentType: "opencode", env: {} }],
    workingDirectory: "/projects/mine",
  });
  const update = await readGatewayConfigForWrite(homeDirectory);
  assert.equal(update.ok, true);
  assert.deepEqual(update.ok ? update.config : undefined, {
    agents: [{ name: "work", agentType: "opencode", env: {} }],
    workingDirectory: "/projects/mine",
  });
});

test("an empty or unreadable working directory is treated as absent", () => {
  assert.deepEqual(parseGatewayConfig({ agents: [], workingDirectory: "  " }), { agents: [] });
  assert.deepEqual(parseGatewayConfig({ agents: [], workingDirectory: 7 }), { agents: [] });
});

test("a directory that cannot be made is refused with what the system said", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  const blocker = join(homeDirectory, "file");
  await writeFile(blocker, "not a directory", "utf8");
  const said: string[] = [];
  assert.equal(await usableWorkingDirectory(join(blocker, "inside"), (line) => said.push(line)), undefined);
  assert.equal(said.length, 1);
  assert.match(said[0] ?? "", /^Cannot use .*file.*inside as the working directory: /);
  const made = join(homeDirectory, "made", "here");
  assert.equal(await usableWorkingDirectory(made, () => undefined), made);
  assert.equal((await stat(made)).isDirectory(), true);
});

test("config stores named agents and ignores a leftover agent command", () => {
  assert.deepEqual(parseGatewayConfig({ agentCommand: "opencode acp", port: 1 }), { agents: [] });
  assert.deepEqual(
    parseGatewayConfig({
      agents: [
        { name: "work", agentType: "opencode", env: { OPENCODE_CONFIG: "/tmp/work" } },
        { name: "broken", agentType: "Not A Type" },
        { name: "work", agentType: "opencode", env: {} },
      ],
    }),
    {
      agents: [{ name: "work", agentType: "opencode", env: { OPENCODE_CONFIG: "/tmp/work" } }],
    },
  );
  assert.equal(defaultConfigText().includes("agentCommand"), false);
  assert.equal(defaultConfigText().includes("47321"), false);
});

test("a custom command is stored with the configuration", () => {
  assert.deepEqual(
    parseGatewayConfig({
      agents: [{ name: "mine", agentType: "custom", env: {}, command: "my-agent", args: ["--stdio"] }],
    }),
    { agents: [{ name: "mine", agentType: "custom", env: {}, command: "my-agent", args: ["--stdio"] }] },
  );
});

test("written config can be read back and is private", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  await writeGatewayConfig(
    { agents: [{ name: "personal", agentType: "opencode", env: { PATH_EXTRA: "bin" } }] },
    homeDirectory,
  );
  if (process.platform !== "win32") assert.equal((await stat(configFilePath(homeDirectory))).mode & 0o777, 0o600);
  const text = await readFile(configFilePath(homeDirectory), "utf8");
  assert.equal(text.includes("personal"), true);
  assert.deepEqual(await readGatewayConfig(homeDirectory), {
    agents: [{ name: "personal", agentType: "opencode", env: { PATH_EXTRA: "bin" } }],
  });
  assert.deepEqual(await readGatewayConfigForWrite(homeDirectory), {
    ok: true,
    config: { agents: [{ name: "personal", agentType: "opencode", env: { PATH_EXTRA: "bin" } }] },
  });
});

test("a missing config file is empty and may be created", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  assert.deepEqual(await readGatewayConfig(homeDirectory), { agents: [] });
  assert.deepEqual(await readGatewayConfigForWrite(homeDirectory), { ok: true, config: { agents: [] } });
});

test("a config file that is not JSON is not treated as empty", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  const path = configFilePath(homeDirectory);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "{", "utf8");
  const launch = await readGatewayConfig(homeDirectory);
  const update = await readGatewayConfigForWrite(homeDirectory);
  assert.deepEqual(launch.agents, []);
  assert.equal(launch.warning, `Cannot read ${path} as JSON.`);
  assert.deepEqual(update, { ok: false, message: `Cannot read ${path} as JSON.` });
  assert.equal(await readFile(path, "utf8"), "{");
});

test("a watched config reports a changed agent list once, and keeps the list through a broken write", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  const path = configFilePath(homeDirectory);
  const changes: string[][] = [];
  const directories: (string | undefined)[] = [];
  const warnings: string[] = [];
  const settled = () => new Promise((resolve) => setTimeout(resolve, 300));
  const stop = watchGatewayConfig({
    homeDirectory,
    config: { agents: [] },
    onChange: (config) => {
      changes.push(config.agents.map((agent) => agent.name));
      directories.push(config.workingDirectory);
    },
    onWarning: (message) => warnings.push(message),
    settleMs: 50,
  });
  try {
    await writeGatewayConfig({ agents: [{ name: "work", agentType: "opencode", env: {} }] }, homeDirectory);
    await settled();
    assert.deepEqual(changes, [["work"]]);

    // Rewriting the same list is not a change.
    await writeGatewayConfig({ agents: [{ name: "work", agentType: "opencode", env: {} }] }, homeDirectory);
    await settled();
    assert.deepEqual(changes, [["work"]]);

    // Choosing a directory is a change even when the agents stay as they are.
    await writeGatewayConfig({ agents: [{ name: "work", agentType: "opencode", env: {} }], workingDirectory: "/mine" }, homeDirectory);
    await settled();
    assert.deepEqual(changes, [["work"], ["work"]]);
    assert.deepEqual(directories, [undefined, "/mine"]);

    await writeFile(path, "{", "utf8");
    await settled();
    assert.deepEqual(changes, [["work"], ["work"]]);
    assert.deepEqual(warnings, [`Cannot read ${path} as JSON. Keeping the previous configuration.`]);

    // An editor that saves by renaming a new file over the old one.
    const next = `${path}.tmp`;
    await writeFile(next, JSON.stringify({ agents: [{ name: "home", agentType: "opencode", env: {} }] }), "utf8");
    await rename(next, path);
    await settled();
    assert.deepEqual(changes, [["work"], ["work"], ["home"]]);
  } finally {
    stop();
  }
});

test("a config whose agents field is not a list is refused for rewrite", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  const path = configFilePath(homeDirectory);
  await mkdir(dirname(path), { recursive: true });
  const text = '{"agents":"nope"}\n';
  await writeFile(path, text, "utf8");
  assert.deepEqual(await readGatewayConfig(homeDirectory), { agents: [] });
  const update = await readGatewayConfigForWrite(homeDirectory);
  assert.equal(update.ok, false);
  assert.equal(await readFile(path, "utf8"), text);
});

test("a config that would drop agent entries is refused for rewrite", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  const path = configFilePath(homeDirectory);
  await mkdir(dirname(path), { recursive: true });
  const text = `${JSON.stringify({
    agents: [
      { name: "work", agentType: "opencode", env: {} },
      { name: "broken", agentType: "Not A Type" },
    ],
  })}\n`;
  await writeFile(path, text, "utf8");
  assert.deepEqual(await readGatewayConfig(homeDirectory), {
    agents: [{ name: "work", agentType: "opencode", env: {} }],
  });
  assert.deepEqual(await readGatewayConfigForWrite(homeDirectory), {
    ok: false,
    message: `Cannot rewrite ${path} without dropping agent entries.`,
  });
  assert.equal(await readFile(path, "utf8"), text);
});
