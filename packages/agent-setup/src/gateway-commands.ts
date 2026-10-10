export const installCommand = "npx mukae";
export const listAgentConfigsCommand = "npx mukae agent-config list";

export function createAgentConfigCommand(agentType: string): string {
  return `npx mukae agent-config create --agent-type ${agentType}`;
}
