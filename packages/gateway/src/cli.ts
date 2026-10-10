#!/usr/bin/env node
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { addAgentConfig, formatAgentConfigList, knownAgentTypes } from "./agents.js";
import { readGatewayConfig, writeGatewayConfig } from "./config.js";
import { openGateway } from "./open-gateway.js";
import { registerLocalGateway } from "./register.js";
import { runCli } from "./run-cli.js";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
const launchServicesRegister =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const result = await runCli(process.argv.slice(2), {
  register: () =>
    registerLocalGateway({
      homeDirectory: homedir(),
      applicationSupportDirectory: join(homedir(), "Library", "Application Support", "mukae"),
      nodePath: process.execPath,
      cliPath,
      platform: process.platform,
      registerApplication: async (applicationPath) => {
        await execFileAsync(launchServicesRegister, ["-f", applicationPath]);
      },
      compileLauncher: async ({ sourcePath, executablePath }) => {
        await execFileAsync("clang", ["-fobjc-arc", "-framework", "Cocoa", "-o", executablePath, sourcePath]);
      },
      inform: (message) => console.log(message),
      warn: (message) => console.error(message),
    }),
  open: (launchUrl) => openGateway(launchUrl),
  listAgentConfigs: async () => {
    const config = await readGatewayConfig();
    process.stdout.write(formatAgentConfigList(config.agents));
  },
  createAgentConfig: async (input) => {
    const config = await readGatewayConfig();
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
  mukae register
  mukae open <mukae-url>
  mukae agent-config list
  mukae agent-config create --agent-type <type> [--name <name>] [--env KEY=VALUE]`);
}
if (result.exitCode !== 0) process.exitCode = result.exitCode;
