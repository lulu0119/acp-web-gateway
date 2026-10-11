import { isAgentType, isEnvName } from "@mukae/contract";
import type { StoredAgent } from "./config.js";

export function addAgentConfig(input: {
  agents: readonly StoredAgent[];
  agentType: string;
  name?: string;
  env: Record<string, string>;
  command?: string;
  args?: readonly string[];
  knownTypes: readonly string[];
}): { ok: true; agents: StoredAgent[]; createdName: string } | { ok: false; message: string } {
  if (!isAgentType(input.agentType) || (!input.command && !input.knownTypes.includes(input.agentType))) {
    return { ok: false, message: `Unknown agent type "${input.agentType}". Run mukae agent-config types.` };
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
      message: `An agent configuration named "${name}" already exists. Pass --name to add another of this type.`,
    };
  }
  const agent: StoredAgent = { name, agentType: input.agentType, env: { ...input.env } };
  if (input.command) {
    agent.command = input.command;
    agent.args = [...(input.args ?? [])];
  }
  return { ok: true, createdName: name, agents: [...input.agents, agent] };
}

export function parseCommandArgv(text: string): string[] | undefined {
  const args: string[] = [];
  let current = "";
  let quoting: "'" | '"' | undefined;
  let started = false;
  for (const char of text) {
    if (quoting) {
      if (char === quoting) quoting = undefined;
      else current += char;
      started = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quoting = char;
      started = true;
      continue;
    }
    if (char === " " || char === "\t") {
      if (started) {
        args.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    if (char === "\n" || char === "\r") return undefined;
    current += char;
    started = true;
  }
  if (quoting || !started) return undefined;
  args.push(current);
  if (args[0]?.length === 0) return undefined;
  return args;
}

export function formatAgentConfigList(agents: readonly StoredAgent[]): string {
  if (agents.length === 0) {
    return "No agent configurations.\nNext: mukae agent-config create --agent-type opencode\n";
  }
  return `${agents.map((agent) => `${agent.name}\t${agent.agentType}`).join("\n")}\n`;
}
