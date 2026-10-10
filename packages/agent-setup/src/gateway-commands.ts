// The gateway package is not on PATH, so every command runs its built entry file from the repository root.
export const gatewayCli = "node packages/gateway/dist/cli.js";

export const installCommand = "pnpm install";
export const buildCommand = "pnpm build";
export const registerCommand = `${gatewayCli} register`;
export const listAgentConfigsCommand = `${gatewayCli} agent-config list`;

export function createAgentConfigCommand(agentType: string): string {
  return `${gatewayCli} agent-config create --agent-type ${agentType}`;
}
