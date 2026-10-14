import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "vitest";
import {
  configFilePath,
  defaultConfigText,
  parseGatewayConfig,
  readGatewayConfig,
  readGatewayConfigForWrite,
  workingDirectoryPath,
  writeGatewayConfig,
} from "./config.js";

test("the working directory is the device data directory", () => {
  assert.equal(workingDirectoryPath("/home/person"), join("/home/person", ".local", "share", "exterior", "workspace"));
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
    agents: [{ name: "personal", agentType: "opencode", env: { PATH_EXTRA: "bin" } }],
  });
});

test("a missing config file is empty and may be created", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "exterior-config-"));
  assert.deepEqual(await readGatewayConfig(homeDirectory), { agents: [] });
  assert.deepEqual(await readGatewayConfigForWrite(homeDirectory), { ok: true, agents: [] });
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
