import { isEnvName } from "@exterior/contract";
import { isAgentType } from "@exterioragentprotocol/sdk";
import type { StoredAgent } from "./config.js";

export function addAgent(input: {
  agents: readonly StoredAgent[];
  agentType: string;
  name?: string;
  env: Record<string, string>;
  command?: string;
  args?: readonly string[];
  knownTypes: readonly string[];
}): { ok: true; agents: StoredAgent[]; addedName: string } | { ok: false; message: string } {
  if (!isAgentType(input.agentType) || (!input.command && !input.knownTypes.includes(input.agentType))) {
    return { ok: false, message: `Unknown agent type "${input.agentType}". Run exterior registry search.` };
  }
  if (input.command !== undefined && input.command.length === 0) {
    return { ok: false, message: "The command is empty." };
  }
  for (const key of Object.keys(input.env)) {
    if (!isEnvName(key)) {
      return { ok: false, message: `Environment variable "${key}" is not a valid name.` };
    }
  }
  const name = (input.name ?? input.agentType).trim();
  if (name.length === 0 || name.length > 128 || /[\r\n\t]/.test(name)) {
    return { ok: false, message: "Name cannot be empty or contain a line break." };
  }
  if (input.agents.some((agent) => agent.name === name)) {
    return {
      ok: false,
      message: `An agent named "${name}" already exists. Pass --name to add another of this type.`,
    };
  }
  const agent: StoredAgent = { name, agentType: input.agentType, env: { ...input.env } };
  if (input.command) {
    agent.command = input.command;
    agent.args = [...(input.args ?? [])];
  }
  return { ok: true, addedName: name, agents: [...input.agents, agent] };
}

export function formatAgentList(agents: readonly StoredAgent[]): string {
  if (agents.length === 0) {
    return "No agents.\nNext: exterior agent add opencode\n";
  }
  return `${agents.map((agent) => `${agent.name}\t${agent.agentType}`).join("\n")}\n`;
}
