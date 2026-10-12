import { isAgentType, isEnvName } from "@mukae/contract";
import { acpRegistryCachePath, commandOnPath, launchForEntry, loadAcpRegistry, platformTarget } from "../../../acp-registry.js";
import { addAgentConfig, parseCommandArgv } from "../../../agents.js";
import { readGatewayConfigForWrite, writeGatewayConfig, type StoredAgent } from "../../../config.js";
import { defineCommand, stringOption, stringsOption, UsageError } from "../../command.js";

export const create = defineCommand({
  name: "create",
  description: "Add an agent configuration",
  help: [
    "Add an agent configuration, either an agent type from the ACP Registry or a custom command.",
    "An npx or uvx entry is started with that tool. A binary entry runs only when its command is already on PATH.",
  ].join("\n\n"),
  options: [
    { flags: "--agent-type <type>", description: "Agent type id from `mukae agent-config types`" },
    { flags: "--command <command>", description: "Command line of an agent that is not in the registry" },
    { flags: "--name <name>", description: "Configuration name (default: the agent type)" },
    { flags: "--env <KEY=VALUE>", description: "Environment for this configuration; repeatable", repeatable: true },
  ],
  examples: [
    "mukae agent-config create --agent-type opencode",
    "mukae agent-config create --agent-type claude-acp --name work --env ANTHROPIC_API_KEY=...",
    "mukae agent-config create --command \"my-agent --stdio\" --name mine",
  ],
  async action({ io }, options) {
    const agentType = stringOption(options, "agent-type");
    const command = stringOption(options, "command");
    const name = stringOption(options, "name");
    if (agentType && command) throw new UsageError("Pass --agent-type or --command, not both.");
    if (!agentType && !command) throw new UsageError("Pass --agent-type <type> or --command <command>.");
    const env = parseEnv(stringsOption(options, "env"));
    const config = await readGatewayConfigForWrite(io.homeDirectory);
    if (!config.ok) {
      io.stderr.write(`${config.message}\n`);
      return 1;
    }
    const added = command
      ? addCustomAgent(config.agents, { command, name, env })
      : await addRegistryAgent(config.agents, { agentType: agentType ?? "", name, env, homeDirectory: io.homeDirectory });
    if (!added.ok) {
      io.stderr.write(`${added.message}\n`);
      return 1;
    }
    await writeGatewayConfig({ agents: added.agents }, io.homeDirectory);
    io.stdout.write(`Created agent configuration "${added.createdName}" (${added.agents.at(-1)?.agentType}).\n`);
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

function addCustomAgent(agents: readonly StoredAgent[], input: { command: string; name?: string; env: Record<string, string> }) {
  const argv = parseCommandArgv(input.command);
  const command = argv?.[0];
  if (!argv || !command) return { ok: false as const, message: "The command is empty or has an unfinished quote." };
  return addAgentConfig({ agents, agentType: "custom", name: input.name, env: input.env, command, args: argv.slice(1), knownTypes: [] });
}

async function addRegistryAgent(
  agents: readonly StoredAgent[],
  input: { agentType: string; name?: string; env: Record<string, string>; homeDirectory: string },
) {
  const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(input.homeDirectory) });
  if (!registry.ok) return registry;
  const entry = registry.agents.find((agent) => agent.id === input.agentType);
  if (!entry) return { ok: false as const, message: `Unknown agent type "${input.agentType}". Run mukae agent-config types.` };
  if (!isAgentType(entry.id)) return { ok: false as const, message: `Agent type "${entry.id}" cannot be used.` };
  const launch = launchForEntry({
    entry,
    platform: platformTarget(),
    commandExists: (command) => commandOnPath(command),
  });
  if (!launch.ok) return launch;
  return addAgentConfig({ agents, agentType: entry.id, name: input.name, env: input.env, knownTypes: [entry.id] });
}
