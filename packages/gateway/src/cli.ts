#!/usr/bin/env node
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { addAgentConfig, formatAgentConfigList, knownAgentTypes } from "./agents.js";
import { readGatewayConfig, readGatewayConfigForWrite, writeGatewayConfig } from "./config.js";
import { installLocalGateway } from "./install.js";
import { readLoginPath } from "./launch-path.js";
import { openGateway } from "./open-gateway.js";
import { registerLocalGateway } from "./register.js";
import { runCli } from "./run-cli.js";
import { runtimeDependencies } from "./runtime.js";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
const packageRoot = join(dirname(cliPath), "..");
const launcherBinaryPath = join(packageRoot, "launcher", "mukae-launcher");
const applicationSupportDirectory = join(homedir(), "Library", "Application Support", "mukae");
const launchServicesRegister =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const registration = {
  homeDirectory: homedir(),
  applicationSupportDirectory,
  nodePath: process.execPath,
  launcherBinaryPath,
  platform: process.platform,
  registerApplication: async (applicationPath: string) => {
    await execFileAsync(launchServicesRegister, ["-f", applicationPath]);
  },
  signApplication: async (applicationPath: string) => {
    await execFileAsync("xattr", ["-cr", applicationPath]).catch(() => undefined);
    await execFileAsync("codesign", ["-s", "-", "--force", applicationPath]);
  },
  inform: (message: string) => console.log(message),
  warn: (message: string) => console.error(message),
};

const result = await runCli(process.argv.slice(2), {
  install: () =>
    installLocalGateway({
      ...registration,
      sourceDistDirectory: dirname(cliPath),
      pathValue: readLoginPath(),
      packages: runtimeDependencies(),
    }),
  register: () => registerLocalGateway({ ...registration, cliPath }),
  open: (launchUrl) => openGateway(launchUrl),
  listAgentConfigs: async () => {
    const config = await readGatewayConfig();
    if (config.warning) {
      console.error(config.warning);
      return 1;
    }
    process.stdout.write(formatAgentConfigList(config.agents));
    return 0;
  },
  createAgentConfig: async (input) => {
    const config = await readGatewayConfigForWrite();
    if (!config.ok) {
      console.error(config.message);
      return 1;
    }
    const added = addAgentConfig({
      agents: config.agents,
      agentType: input.agentType,
      name: input.name,
      env: input.env,
      knownTypes: knownAgentTypes(),
    });
    if (!added.ok) {
      console.error(added.message);
      return 1;
    }
    await writeGatewayConfig({ agents: added.agents });
    console.log(`Created agent configuration "${added.createdName}" (${input.agentType}).`);
    return 0;
  },
});

if (result.showUsage) {
  console.error(`Usage:
  mukae
  mukae register
  mukae open <mukae-url>
  mukae agent-config list
  mukae agent-config create --agent-type <type> [--name <name>] [--env KEY=VALUE]`);
}
if (result.exitCode !== 0) process.exitCode = result.exitCode;
