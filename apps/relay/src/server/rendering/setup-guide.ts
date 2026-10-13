import type { SetupGuideData } from "../../shared/account-web.js";
import { highlight } from "./highlight.js";

const previewPackage = "https://pkg.pr.new/lulu0119/mukae@main";
const runner = `npx --package=${previewPackage} -- mukae`;

export function setupGuide(relayUrl: string): SetupGuideData {
  return {
    relayUrl,
    prompt: highlight(agentPrompt(relayUrl), "markdown"),
    commands: highlight(shellSteps(relayUrl), "shellscript"),
    afterLogin: highlight(afterLogin(relayUrl), "shellscript"),
  };
}

function agentPrompt(relayUrl: string): string {
  return `Connect this computer to Mukae so my web page can use the ACP agents installed here.

Mukae relay: ${relayUrl}

1. Sign this device in. It prints a link with the code filled in. Ask me to open that link and approve it, then wait for sign-in to finish.

   \`\`\`sh
   ${runner} login --relay ${relayUrl}
   \`\`\`

2. Configure each agent already installed on this computer. Use one id from \`types\` per installed agent (for example \`opencode\`).

   \`\`\`sh
   ${runner} agent-config types
   ${runner} agent-config create --agent-type <type>
   ${runner} agent-config list
   \`\`\`

3. Keep this device online. Keep it running in the foreground so the page sees this device.

   \`\`\`sh
   ${runner} daemon --relay ${relayUrl}
   \`\`\`

Limits:

- Do not use sudo or install anything globally.
- Do not write API keys or tokens into the config. If an agent needs environment variables, ask me first.
- If node (22 or newer) or npx is missing, stop and tell me.

When the daemon is online, tell me which agents were configured and remind me to return to the page.`;
}

function shellSteps(relayUrl: string): string {
  return `# 1. Sign this device in, then approve the code it prints
${runner} login --relay ${relayUrl}

# 2. Configure an agent that is installed here
${runner} agent-config types
${runner} agent-config create --agent-type opencode

# 3. Keep the device online
${runner} daemon --relay ${relayUrl}`;
}

function afterLogin(relayUrl: string): string {
  return `# Configure an agent that is installed here
${runner} agent-config types
${runner} agent-config create --agent-type opencode

# Keep the device online
${runner} daemon --relay ${relayUrl}`;
}
