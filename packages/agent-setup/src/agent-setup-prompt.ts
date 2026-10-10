import { installCommand, listAgentConfigsCommand } from "./gateway-commands.js";

/**
 * The text a person pastes into their own coding agent. The agent runs the installer on this
 * machine, so the steps name the exact command and the check that proves it worked.
 */
export function buildAgentSetupPrompt(): string {
  return `Install mukae on this computer so the web page can use the ACP agents I already have installed.

Run:
${installCommand}

That copies the gateway into ~/Library/Application Support/mukae, registers the mukae:// handler, and writes a configuration for each installed agent that completes an ACP handshake.

Limits:
- Do not change source, use sudo, or install anything globally.
- Do not write API keys or tokens into the config. If an agent needs environment variables, ask me first.
- If node (22 or newer) or npx is missing, stop and tell me.
- If the command says an agent listed a sign-in method, tell me. Leave the configuration it wrote.

After it finishes, run:
${listAgentConfigsCommand}

Then tell me which agents were configured, which were already configured, which are not installed, and which need a sign-in.
Remind me to return to the web page, choose a type, click Connect, and allow the browser prompt.`;
}
