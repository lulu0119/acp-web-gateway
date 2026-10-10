import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { configFilePath } from "./config.js";
import { registerLocalGateway } from "./register.js";
import { runtimePointerPath } from "./runtime.js";

const launcherSourcePath = fileURLToPath(new URL("../launcher/launcher.m", import.meta.url));
const launcherBinaryPath = fileURLToPath(new URL("../launcher/mukae-launcher", import.meta.url));

test("the shipped launcher reads a pointer and resolves node from the login shell", async () => {
  const source = await readFile(launcherSourcePath, "utf8");
  assert.match(source, /runtime\.json/);
  assert.match(source, /command -v node/);
  assert.doesNotMatch(source, /static NSString \*nodePath = @"\//);
  const binary = await readFile(launcherBinaryPath);
  const thin = binary.readUInt32LE(0);
  const fat = binary.readUInt32BE(0);
  assert.ok(thin === 0xfeedfacf || fat === 0xcafebabe);
});

test("macOS registration writes the pointer and a windowless URL handler", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-home-"));
  const applicationSupportDirectory = await mkdtemp(join(tmpdir(), "mukae-app-"));
  const binaryPath = join(homeDirectory, "launcher-binary");
  await writeFile(binaryPath, "launcher-bytes");
  const registered: string[] = [];
  const signed: string[] = [];
  const notices: string[] = [];
  await registerLocalGateway({
    homeDirectory,
    applicationSupportDirectory,
    nodePath: "/opt/node/bin/node",
    cliPath: "/Apps/O'Hare/cli.js",
    launcherBinaryPath: binaryPath,
    platform: "darwin",
    registerApplication: async (applicationPath) => {
      registered.push(applicationPath);
    },
    signApplication: async (applicationPath) => {
      signed.push(applicationPath);
    },
    inform: (message) => notices.push(message),
  });

  const config = await readFile(configFilePath(homeDirectory), "utf8");
  assert.match(config, /"agents": \[\]/);
  const pointer = JSON.parse(await readFile(runtimePointerPath(applicationSupportDirectory), "utf8")) as {
    nodePath: string;
    cliPath: string;
  };
  assert.deepEqual(pointer, { nodePath: "/opt/node/bin/node", cliPath: "/Apps/O'Hare/cli.js" });
  const plist = await readFile(join(applicationSupportDirectory, "Mukae.app", "Contents", "Info.plist"), "utf8");
  assert.match(plist, /mukae/);
  assert.match(plist, /Mukae/);
  assert.match(plist, /LSUIElement/);
  const launcher = await readFile(join(applicationSupportDirectory, "Mukae.app", "Contents", "MacOS", "launcher"));
  assert.equal(launcher.toString(), "launcher-bytes");
  assert.deepEqual(signed, [join(applicationSupportDirectory, "Mukae.app")]);
  assert.deepEqual(registered, [join(applicationSupportDirectory, "Mukae.app")]);
  assert.equal(notices.some((notice) => notice.includes("agent-config create --agent-type opencode")), true);
});

test("registration fails before writing when the launcher binary is missing", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-home-"));
  const applicationSupportDirectory = await mkdtemp(join(tmpdir(), "mukae-app-"));
  await assert.rejects(
    () =>
      registerLocalGateway({
        homeDirectory,
        applicationSupportDirectory,
        nodePath: "/usr/bin/node",
        cliPath: "/cli.js",
        launcherBinaryPath: join(homeDirectory, "missing-launcher"),
        platform: "darwin",
      }),
    /launcher binary is missing/,
  );
  await assert.rejects(() => readFile(configFilePath(homeDirectory), "utf8"));
});

test("other platforms write the pointer and config, and skip the app bundle", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-home-"));
  const applicationSupportDirectory = await mkdtemp(join(tmpdir(), "mukae-app-"));
  const warnings: string[] = [];
  const notices: string[] = [];
  let registered = false;
  await registerLocalGateway({
    homeDirectory,
    applicationSupportDirectory,
    nodePath: "/usr/bin/node",
    cliPath: "/cli.js",
    launcherBinaryPath: "/unused",
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
  const pointer = JSON.parse(await readFile(runtimePointerPath(applicationSupportDirectory), "utf8")) as {
    cliPath: string;
  };
  assert.equal(pointer.cliPath, "/cli.js");
});
