const gatewayPackage = "https://pkg.pr.new/lulu0119/mukae@main";

export const installCommand = `npx --package=${gatewayPackage} -- mukae`;
export const listAgentConfigsCommand = `npx --package=${gatewayPackage} -- mukae agent-config list`;

export function createAgentConfigCommand(agentType: string): string {
  return `npx --package=${gatewayPackage} -- mukae agent-config create --agent-type ${agentType}`;
}
