import {
  buildCommand,
  createAgentConfigCommand,
  installCommand,
  listAgentConfigsCommand,
  registerCommand,
} from "./gateway-commands.js";
import { shellQuote } from "./shell-quote.js";

/**
 * The text a person pastes into their own coding agent. The agent does the setup on this machine,
 * so every step names the exact command and the check that proves it worked.
 */
export function buildAgentSetupPrompt(repositoryPath: string): string {
  return `Configure mukae on this computer so the web page can use the ACP agents I already have installed.

Repository directory: ${repositoryPath}
Run every command from the repository directory. Start with: cd ${shellQuote(repositoryPath)}
Agent launch commands come from packages/gateway/src/agents.ts. Read that file first.

Limits:
- Do not change the source, use sudo, or install anything globally.
- Do not write API keys or tokens into the config. If an agent needs environment variables, ask me first.
- If node (22 or newer), pnpm, or clang is missing, or an agent needs me to sign in first, stop and tell me. Do not guess.
- Detect and verify with the login shell PATH, the same one the gateway uses, for example zsh -lic 'command'. Ignore text the shell prints to stderr at startup.

Steps

1. Check the environment
   Run uname -s. The result should be Darwin. If it is not, finish the later steps anyway, then tell me: automatic browser connection is not available on this machine.

2. Build
   ${installCommand}
   ${buildCommand}

3. Register the link and write the config file
   ${registerCommand}

4. Find installed agents
   An agent counts as installed only when its own CLI is on PATH:
   - opencode → opencode
   - claude-acp → claude
   - codex-acp → codex
   - gemini → gemini
   Types whose launch command uses npx (claude-acp, codex-acp, gemini) also need npx on PATH.
   Skip a missing type and say why.

5. Verify that the launch command can complete an ACP handshake
   For each type found in step 4, start a subprocess with the command and args from agents.ts unchanged, then:
   - Write one JSON line to stdin:
     {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}
   - Read the first JSON line from stdout. Wait at most 120 seconds; the first npx download is slow.
   - It passes when the response has result and result.protocolVersion is 1.
   - End the subprocess whether it passed or failed.
   - Put the verification script in a temporary directory. Do not write it into the repository.
   - Do not write a config for a type that failed, and keep the first lines of its stderr.
   - When it passes, if result.authMethods is not empty, tell me that agent may need a sign-in first.

6. Write configurations
   ${listAgentConfigsCommand}
   - Keep a configuration that already exists for that type. Do not create another one.
   - Run this only for a type that passed step 5 and has no configuration yet:
     ${createAgentConfigCommand("<type>")}
   - Do not pass --name unless I explicitly ask for one.
   - There is no command to delete or edit a configuration. Do not edit ~/.config/mukae/config.json by hand. If an existing configuration looks damaged, tell me. Do not overwrite it.

7. Check again
   Run ${listAgentConfigsCommand} once more and confirm the output matches step 6.

8. Report
   List each type in a table: configured / already configured / not installed / verification failed (with the reason).
   Then list anything I still need to do by hand.
   Finally, remind me to return to the web page, choose a type, click Connect, and allow the browser prompt.`;
}
