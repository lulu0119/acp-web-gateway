import { isEnvName } from "@exterior/contract";
import { isAgentType } from "@exterioragentprotocol/sdk";
import { acpRegistryCachePath, launchForEntry, loadAcpRegistry, platformTarget } from "../../../acp-registry.js";
import { addAgent } from "../../../agents.js";
import { readGatewayConfig, writeGatewayConfig, type StoredAgent } from "../../../config.js";
import { defineCommand, stringOption, stringsOption, UsageError } from "../../command.js";

export const add = defineCommand({
  name: "add",
  description: "Add an agent",
  help: [
    "Add an agent, either an agent type from the ACP Registry or a command of its own.",
    "An npx or uvx type is started with that tool. A binary type runs only when its command is already on PATH.",
    "A command of its own goes after `--`, one argument per word, exactly as your shell split it. Exterior does not split it again, so quote an argument that holds a space as your shell needs.",
  ].join("\n\n"),
  options: [
    { flags: "--name <name>", description: "Agent name (default: the agent type); required for a command" },
    { flags: "--env <KEY=VALUE>", description: "Environment for this agent; repeatable", repeatable: true },
  ],
  operands: ["<type>", "--name <name> -- <command> [args...]"],
  passthrough: true,
  examples: [
    "exterior agent add opencode",
    "exterior agent add --name work --env ANTHROPIC_API_KEY=... claude-acp",
    "exterior agent add --name claude -- pnpm dlx @agentclientprotocol/claude-agent-acp",
    "exterior agent add --name claude-logged -- sh -c \"pnpm dlx @agentclientprotocol/claude-agent-acp 2>> 'claude acp.log'\"",
  ],
  async action({ io }, options, operands, command) {
    const name = stringOption(options, "name");
    const [agentType, extra] = operands;
    if (agentType !== undefined && command.length > 0) throw new UsageError("Give an agent type or a command after --, not both.");
    if (agentType === undefined && command.length === 0) throw new UsageError("Give an agent type from `exterior registry search`, or a command after --.");
    if (extra !== undefined) throw new UsageError(`Unexpected argument "${extra}". A command and its arguments go after --.`);
    if (command.length > 0 && name === undefined) throw new UsageError("A command needs --name <name>.");
    const env = parseEnv(stringsOption(options, "env"));
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    const added = agentType === undefined
      ? addCustomAgent(config.agents, { command, name, env })
      : await addRegistryAgent(config.agents, { agentType, name, env, homeDirectory: io.homeDirectory });
    if (!added.ok) {
      io.stderr.write(`${added.message}\n`);
      return 1;
    }
    await writeGatewayConfig({ ...config, agents: added.agents }, io.homeDirectory);
    io.stdout.write(`Added agent "${added.addedName}" (${added.agents.at(-1)?.agentType}).\n`);
    return 0;
  },
});

function parseEnv(entries: readonly string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    const key = separator > 0 ? entry.slice(0, separator) : "";
    if (!isEnvName(key)) throw new UsageError(`--env takes KEY=VALUE, got "${entry}".`);
    env[key] = entry.slice(separator + 1);
  }
  return env;
}

function addCustomAgent(agents: readonly StoredAgent[], input: { command: readonly string[]; name?: string; env: Record<string, string> }) {
  const [command = "", ...args] = input.command;
  return addAgent({ agents, agentType: "custom", name: input.name, env: input.env, command, args, knownTypes: [] });
}

async function addRegistryAgent(
  agents: readonly StoredAgent[],
  input: { agentType: string; name?: string; env: Record<string, string>; homeDirectory: string },
) {
  const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(input.homeDirectory) });
  if (!registry.ok) return registry;
  const entry = registry.agents.find((agent) => agent.id === input.agentType);
  if (!entry) return { ok: false as const, message: `Unknown agent type "${input.agentType}". Run exterior registry search.` };
  if (!isAgentType(entry.id)) return { ok: false as const, message: `Agent type "${entry.id}" cannot be used.` };
  const launch = launchForEntry({
    entry,
    platform: platformTarget(),
  });
  if (!launch.ok) return launch;
  return addAgent({ agents, agentType: entry.id, name: input.name, env: input.env, knownTypes: [entry.id] });
}
