import { cn } from "cn";

/**
 * Agents in the ACP registry, keyed by registry id: the name the registry gives each, and its mark
 * from lobe-icons where lobe-icons has one. Icon classes are written out in full so Tailwind finds
 * them here. An agent missing here, or a custom agent type, shows its type and a plain robot.
 */
const registryAgents: Record<string, { name: string; icon?: string }> = {
  "agoragentic-acp": { name: "Agoragentic" },
  "amp-acp": { name: "Amp", icon: "icon-[lobe-icons--amp-color]" },
  "antigravity-acp": { name: "Google Antigravity", icon: "icon-[lobe-icons--antigravity-color]" },
  auggie: { name: "Auggie CLI" },
  autohand: { name: "Autohand Code" },
  bob: { name: "Bob" },
  "claude-acp": { name: "Claude Agent", icon: "icon-[lobe-icons--claudecode-color]" },
  cline: { name: "Cline", icon: "icon-[lobe-icons--cline]" },
  "codebuddy-code": { name: "Codebuddy Code" },
  "codex-acp": { name: "Codex", icon: "icon-[lobe-icons--codex-color]" },
  "cortex-code": { name: "Cortex Code", icon: "icon-[lobe-icons--snowflake-color]" },
  "corust-agent": { name: "Corust Agent" },
  "crow-cli": { name: "crow-cli" },
  cursor: { name: "Cursor", icon: "icon-[lobe-icons--cursor]" },
  deepagents: { name: "DeepAgents", icon: "icon-[lobe-icons--langchain-color]" },
  devin: { name: "Devin" },
  dimcode: { name: "DimCode" },
  dirac: { name: "Dirac" },
  "factory-droid": { name: "Factory Droid" },
  "fast-agent": { name: "fast-agent" },
  gemini: { name: "Gemini CLI", icon: "icon-[lobe-icons--geminicli-color]" },
  "github-copilot-cli": { name: "Copilot", icon: "icon-[lobe-icons--githubcopilot]" },
  "glm-acp-agent": { name: "GLM Agent", icon: "icon-[lobe-icons--zhipu-color]" },
  goose: { name: "goose", icon: "icon-[lobe-icons--goose]" },
  "grok-build": { name: "Grok Build", icon: "icon-[lobe-icons--grok]" },
  harn: { name: "Harn" },
  junie: { name: "Junie", icon: "icon-[lobe-icons--junie-color]" },
  kilo: { name: "Kilo", icon: "icon-[lobe-icons--kilocode]" },
  kimchi: { name: "Kimchi" },
  kimi: { name: "Kimi CLI", icon: "icon-[lobe-icons--kimi-color]" },
  "minimax-code": { name: "MiniMax Code", icon: "icon-[lobe-icons--minimax-color]" },
  "minion-code": { name: "Minion Code" },
  "mistral-vibe": { name: "Mistral Vibe", icon: "icon-[lobe-icons--mistral-color]" },
  nova: { name: "Nova" },
  opencode: { name: "OpenCode", icon: "icon-[lobe-icons--opencode]" },
  "pi-acp": { name: "pi ACP" },
  poolside: { name: "Poolside" },
  qoder: { name: "Qoder CLI", icon: "icon-[lobe-icons--qoder-color]" },
  "qwen-code": { name: "Qwen Code", icon: "icon-[lobe-icons--qwen-color]" },
  sigit: { name: "siGit Code" },
  stakpak: { name: "Stakpak" },
  vtcode: { name: "VT Code" },
};

/** An agent's mark by its type. Sized by font size; decorative, since its name sits beside it. */
export function AgentIcon({ agentType, className }: { agentType: string; className?: string }) {
  return <span className={cn(registryAgents[agentType]?.icon ?? "icon-[mingcute--robot-line]", "shrink-0", className)} aria-hidden />;
}

/** The registry's name for an agent type, or the type itself when the registry does not list it. */
export function agentTypeName(agentType: string): string {
  return registryAgents[agentType]?.name ?? agentType;
}
