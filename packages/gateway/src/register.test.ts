import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configFilePath } from "./config.js";
import { registerLocalGateway } from "./register.js";

test("macOS registration writes config and a windowless URL handler", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-home-"));
  const applicationSupportDirectory = await mkdtemp(join(tmpdir(), "mukae-app-"));
  const registered: string[] = [];
  const notices: string[] = [];
  await registerLocalGateway({
    homeDirectory,
    applicationSupportDirectory,
    nodePath: "/opt/node/bin/node",
    cliPath: "/Apps/O'Hare/cli.js",
    platform: "darwin",
    registerApplication: async (applicationPath) => {
      registered.push(applicationPath);
    },
    compileLauncher: async ({ sourcePath, executablePath }) => {
      await copyFile(sourcePath, executablePath);
    },
    inform: (message) => notices.push(message),
  });

  const config = await readFile(configFilePath(homeDirectory), "utf8");
  assert.match(config, /"agents": \[\]/);
  const plist = await readFile(join(applicationSupportDirectory, "Mukae.app", "Contents", "Info.plist"), "utf8");
  assert.match(plist, /mukae/);
  assert.match(plist, /Mukae/);
  assert.match(plist, /LSUIElement/);
  const launcher = await readFile(
    join(applicationSupportDirectory, "Mukae.app", "Contents", "MacOS", "launcher"),
    "utf8",
  );
  assert.match(launcher, /\/opt\/node\/bin\/node/);
  assert.match(launcher, /\/Apps\/O'Hare\/cli.js/);
  assert.match(launcher, /kAEGetURL/);
  assert.match(launcher, /mukae:/);
  assert.deepEqual(registered, [join(applicationSupportDirectory, "Mukae.app")]);
  assert.equal(notices.some((notice) => notice.includes("agent-config create --agent-type opencode")), true);
});

test("other platforms write config and skip the app bundle", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-home-"));
  const warnings: string[] = [];
  const notices: string[] = [];
  let registered = false;
  await registerLocalGateway({
    homeDirectory,
    applicationSupportDirectory: "/unused",
    nodePath: "/usr/bin/node",
    cliPath: "/cli.js",
    platform: "linux",
    registerApplication: async () => {
      registered = true;
    },
    warn: (message) => warnings.push(message),
    inform: (message) => notices.push(message),
  });
  assert.equal(registered, false);
  assert.equal(warnings.length, 1);
  assert.equal(notices.length, 1);
  const config = await readFile(configFilePath(homeDirectory), "utf8");
  assert.match(config, /"agents": \[\]/);
});
