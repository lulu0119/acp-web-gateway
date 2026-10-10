import { launchAgentTypes, type LaunchAgentType } from "@mukae/contract";
import type { StoredAgent } from "./config.js";

export type AgentLaunch = {
  command: string;
  args: readonly string[];
};

const builtinAgents: Record<LaunchAgentType, AgentLaunch> = {
  "claude-acp": { command: "npx", args: ["-y", "@agentclientprotocol/claude-agent-acp@0.89.1"] },
  "codex-acp": { command: "npx", args: ["-y", "@agentclientprotocol/codex-acp@2.2.2"] },
  gemini: { command: "npx", args: ["-y", "@google/gemini-cli@0.63.0", "--acp"] },
  opencode: { command: "opencode", args: ["acp"] },
};

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function knownAgentTypes(): readonly string[] {
  return launchAgentTypes;
}

export function launchForAgentType(agentType: string): AgentLaunch | undefined {
  if (!isLaunchAgentType(agentType)) return undefined;
  return builtinAgents[agentType];
}

function isLaunchAgentType(agentType: string): agentType is LaunchAgentType {
  return (launchAgentTypes as readonly string[]).includes(agentType);
}

export function addAgentConfig(input: {
  agents: readonly StoredAgent[];
  agentType: string;
  name?: string;
  env: Record<string, string>;
  knownTypes: readonly string[];
}): { ok: true; agents: StoredAgent[]; createdName: string } | { ok: false; message: string } {
  if (!input.knownTypes.includes(input.agentType)) {
    const choices = input.knownTypes.length > 0 ? input.knownTypes.join(", ") : "(none)";
    return { ok: false, message: `Unknown agent type "${input.agentType}". Choose one of: ${choices}.` };
  }
  for (const key of Object.keys(input.env)) {
    if (!envNamePattern.test(key)) {
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
  return {
    ok: true,
    createdName: name,
    agents: [...input.agents, { name, agentType: input.agentType, env: { ...input.env } }],
  };
}

export function formatAgentConfigList(agents: readonly StoredAgent[]): string {
  if (agents.length === 0) {
    return "No agent configurations.\nNext: mukae agent-config create --agent-type opencode\n";
  }
  return `${agents.map((agent) => `${agent.name}\t${agent.agentType}`).join("\n")}\n`;
}
