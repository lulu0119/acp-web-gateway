#!/usr/bin/env node
import { hostname } from "node:os";
import { addAgentConfig, formatAgentConfigList, knownAgentTypes } from "./agents.js";
import { readGatewayConfig, readGatewayConfigForWrite, writeGatewayConfig } from "./config.js";
import { runDaemon } from "./daemon.js";
import { signInDaemon, usableDaemonSession } from "./login.js";
import { runCli } from "./run-cli.js";

const result = await runCli(process.argv.slice(2), {
  login: async (relayUrl) => {
    try {
      await signInDaemon(relayUrl, (line) => console.log(line));
      console.log("Signed in. Next: mukae daemon");
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Sign-in failed.");
      return 1;
    }
  },
  daemon: async (relayUrl) => {
    try {
      const session = await usableDaemonSession();
      if (session.relayUrl !== new URL(relayUrl).origin) {
        console.error(`This machine is signed in to ${session.relayUrl}. Run mukae login --relay ${relayUrl} to switch.`);
        return 1;
      }
      const config = await readGatewayConfig();
      if (config.warning) {
        console.error(config.warning);
        return 1;
      }
      if (config.agents.length === 0) {
        console.error("No agent configurations.\nNext: mukae agent-config create --agent-type opencode");
        return 1;
      }
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      await runDaemon({
        relayUrl: session.relayUrl,
        accessToken: session.accessToken,
        hostname: hostname(),
        agents: config.agents,
        signal: controller.signal,
      });
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "The daemon stopped.");
      return 1;
    }
  },
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
  mukae login [--relay <url>]
  mukae daemon [--relay <url>]
  mukae agent-config list
  mukae agent-config create --agent-type <type> [--name <name>] [--env KEY=VALUE]`);
}
if (result.exitCode !== 0) process.exitCode = result.exitCode;
