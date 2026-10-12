#!/usr/bin/env node
import { defaultRelayUrl, isAgentType } from "@mukae/contract";
import { hostname } from "node:os";
import { commandOnPath, formatRegistryAgents, launchForEntry, loadAcpRegistry, platformTarget } from "./acp-registry.js";
import { addAgentConfig, formatAgentConfigList, parseCommandArgv } from "./agents.js";
import { readGatewayConfig, readGatewayConfigForWrite, writeGatewayConfig, type StoredAgent } from "./config.js";
import { runDaemon } from "./daemon.js";
import { signInDaemon, usableSignIn } from "./login.js";
import { parseRelayUrl, runCli } from "./run-cli.js";
import { chooseRelay, readSignIns, removeSignIn } from "./sign-ins.js";

const environmentRelay = process.env.MUKAE_RELAY ? parseRelayUrl(process.env.MUKAE_RELAY) : undefined;
if (process.env.MUKAE_RELAY && !environmentRelay) {
  console.error(`MUKAE_RELAY is not a relay address: ${process.env.MUKAE_RELAY}`);
  process.exit(1);
}

const result = await runCli(process.argv.slice(2), {
  login: async (requested) => {
    const signedIn = await readSignIns();
    const chosen = chooseRelay({ requested: requested ?? environmentRelay, signedIn, command: "login" });
    if (!chosen.ok && signedIn.length > 0) {
      console.error(chosen.message);
      return 1;
    }
    const relayUrl = chosen.ok ? chosen.relayUrl : defaultRelayUrl;
    console.log(`Signing in to ${relayUrl}.`);
    try {
      await signInDaemon(relayUrl, (line) => console.log(line));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Sign-in failed.");
      if (!chosen.ok) console.error("Pass --relay <url> to sign in to another Mukae.");
      return 1;
    }
    const others = signedIn.filter((signIn) => signIn.relayUrl !== relayUrl).length;
    console.log(`Signed in to ${relayUrl}. Next: mukae daemon${others > 0 ? ` --relay ${relayUrl}` : ""}`);
    return 0;
  },
  logout: async (requested) => {
    const signedIn = await readSignIns();
    const chosen = chooseRelay({ requested: requested ?? environmentRelay, signedIn, command: "logout" });
    if (!chosen.ok) {
      console.error(chosen.message);
      return 1;
    }
    if (!signedIn.some((signIn) => signIn.relayUrl === chosen.relayUrl)) {
      console.error(`This machine is not signed in to ${chosen.relayUrl}.`);
      return 1;
    }
    await removeSignIn(chosen.relayUrl);
    console.log(`Signed out of ${chosen.relayUrl}.`);
    return 0;
  },
  status: async () => {
    const signedIn = await readSignIns();
    if (signedIn.length === 0) {
      console.log("This machine is not signed in. Run mukae login --relay <url>.");
      return 0;
    }
    for (const signIn of signedIn) console.log(`Signed in to ${signIn.relayUrl}`);
    return 0;
  },
  daemon: async (requested) => {
    const chosen = chooseRelay({ requested: requested ?? environmentRelay, signedIn: await readSignIns(), command: "daemon" });
    if (!chosen.ok) {
      console.error(chosen.message);
      return 1;
    }
    const { relayUrl } = chosen;
    try {
      const config = await readGatewayConfig();
      if (config.warning) {
        console.error(config.warning);
        return 1;
      }
      if (config.agents.length === 0) {
        console.error("No agent configurations.\nNext: mukae agent-config create --agent-type opencode");
        return 1;
      }
      const registry = await loadAcpRegistry();
      if (!registry.ok) console.error(registry.message);
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      await runDaemon({
        relayUrl,
        getAccessToken: async (forceRefresh, signal) => (await usableSignIn({ relayUrl, forceRefresh, signal })).accessToken,
        inform: (line) => console.error(`${new Date().toISOString()} [mukae] ${line}`),
        hostname: hostname(),
        agents: config.agents,
        signal: controller.signal,
        catalog: registry.ok ? registry.agents : [],
      });
      return 0;
    } catch (error) {
      console.error(`${new Date().toISOString()} [mukae] ${error instanceof Error ? error.message : "The daemon stopped."}`);
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
  listAgentTypes: async () => {
    const registry = await loadAcpRegistry();
    if (!registry.ok) {
      console.error(registry.message);
      return 1;
    }
    process.stdout.write(formatRegistryAgents(registry.agents));
    return 0;
  },
  createAgentConfig: async (input) => {
    const config = await readGatewayConfigForWrite();
    if (!config.ok) {
      console.error(config.message);
      return 1;
    }
    const added = input.command
      ? addCustomAgent(config.agents, input)
      : await addRegistryAgent(config.agents, input);
    if (!added.ok) {
      console.error(added.message);
      return 1;
    }
    await writeGatewayConfig({ agents: added.agents });
    console.log(`Created agent configuration "${added.createdName}" (${added.agents.at(-1)?.agentType}).`);
    return 0;
  },
});

if (result.showUsage) {
  console.error(`Usage:
  mukae login [--relay <url>]
  mukae logout [--relay <url>]
  mukae status
  mukae daemon [--relay <url>]
  mukae agent-config list
  mukae agent-config types
  mukae agent-config create --agent-type <type> [--name <name>] [--env KEY=VALUE]
  mukae agent-config create --command <command> [--name <name>] [--env KEY=VALUE]`);
}
if (result.exitCode !== 0) process.exitCode = result.exitCode;

function addCustomAgent(agents: readonly StoredAgent[], input: { name?: string; env: Record<string, string>; command?: string }) {
  const argv = parseCommandArgv(input.command ?? "");
  const command = argv?.[0];
  if (!argv || !command) return { ok: false as const, message: "The command is empty or has an unfinished quote." };
  return addAgentConfig({ agents, agentType: "custom", name: input.name, env: input.env, command, args: argv.slice(1), knownTypes: [] });
}

async function addRegistryAgent(agents: readonly StoredAgent[], input: { agentType?: string; name?: string; env: Record<string, string> }) {
  const registry = await loadAcpRegistry();
  if (!registry.ok) return registry;
  const entry = registry.agents.find((agent) => agent.id === input.agentType);
  if (!entry || !input.agentType) {
    return { ok: false as const, message: `Unknown agent type "${input.agentType ?? ""}". Run mukae agent-config types.` };
  }
  if (!isAgentType(entry.id)) return { ok: false as const, message: `Agent type "${entry.id}" cannot be used.` };
  const launch = launchForEntry({
    entry,
    platform: platformTarget(),
    commandExists: (command) => commandOnPath(command),
  });
  if (!launch.ok) return launch;
  return addAgentConfig({ agents, agentType: entry.id, name: input.name, env: input.env, knownTypes: [entry.id] });
}
