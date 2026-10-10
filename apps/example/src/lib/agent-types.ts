import type { LaunchAgentType } from "@mukae/contract";

export const agentTypeLabels: Record<LaunchAgentType, string> = {
  "claude-acp": "Claude Agent",
  "codex-acp": "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};
