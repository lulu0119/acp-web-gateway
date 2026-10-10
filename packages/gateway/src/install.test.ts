import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readGatewayConfig } from "./config.js";
import { installLocalGateway } from "./install.js";
import type { ProbeOutcome } from "./probe.js";
import { runtimePointerPath } from "./runtime.js";

test("install copies the runtime, records the pointer, and configures agents that answer", async () => {
  const root = await mkdtemp(join(tmpdir(), "mukae-install-"));
  const homeDirectory = join(root, "home");
  const applicationSupportDirectory = join(root, "support");
  const source = join(root, "dist");
  const dependency = join(root, "dep");
  const binaryPath = join(root, "launcher-binary");
  await mkdir(source);
  await mkdir(dependency);
  await writeFile(join(source, "cli.js"), "console.log('gateway');\n");
  await writeFile(join(source, "skip.test.js"), "nope\n");
  await writeFile(join(dependency, "package.json"), '{"name":"ws"}\n');
  await writeFile(binaryPath, "launcher-bytes");
  const probed: string[] = [];
  const notices: string[] = [];
  const signed: string[] = [];

  await installLocalGateway({
    homeDirectory,
    applicationSupportDirectory,
    sourceDistDirectory: source,
    nodePath: "/opt/node/bin/node",
    launcherBinaryPath: binaryPath,
    platform: "darwin",
    pathValue: "/usr/bin",
    packages: [{ name: "@mukae/contract", directory: dependency }],
    signApplication: async (applicationPath) => {
      signed.push(applicationPath);
    },
    probeAgentType: async (agentType): Promise<ProbeOutcome> => {
      probed.push(agentType);
      if (agentType === "opencode") return { status: "ready" };
      if (agentType === "gemini") return { status: "sign-in", methods: ["Google"] };
      return { status: "missing", command: agentType };
    },
    inform: (message) => notices.push(message),
  });

  const cliPath = join(applicationSupportDirectory, "runtime", "dist", "cli.js");
  assert.equal(await readFile(cliPath, "utf8"), "console.log('gateway');\n");
  await assert.rejects(() => readFile(join(applicationSupportDirectory, "runtime", "dist", "skip.test.js"), "utf8"));
  assert.match(
    await readFile(join(applicationSupportDirectory, "runtime", "node_modules", "@mukae", "contract", "package.json"), "utf8"),
    /"name":"ws"/,
  );
  const pointer = JSON.parse(await readFile(runtimePointerPath(applicationSupportDirectory), "utf8")) as {
    nodePath: string;
    cliPath: string;
  };
  assert.deepEqual(pointer, { nodePath: "/opt/node/bin/node", cliPath });
  assert.equal(
    (await readFile(join(applicationSupportDirectory, "Mukae.app", "Contents", "MacOS", "launcher"))).toString(),
    "launcher-bytes",
  );
  assert.deepEqual(signed, [join(applicationSupportDirectory, "Mukae.app")]);
  const config = await readGatewayConfig(homeDirectory);
  assert.deepEqual(
    config.agents.map((agent) => agent.agentType),
    ["gemini", "opencode"],
  );
  assert.deepEqual(probed, ["claude-acp", "codex-acp", "gemini", "opencode"]);
  const report = notices.join("\n");
  assert.match(report, /Installed mukae/);
  assert.match(report, /opencode: configured/);
  assert.match(report, /gemini: configured; sign-in available \(Google\)/);
  assert.match(report, /configuration was still written/);
});
