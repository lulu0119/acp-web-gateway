import { isAgentType, isEnvName } from "@exterior/contract";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type StoredAgent = {
  name: string;
  agentType: string;
  env: Record<string, string>;
  command?: string;
  args?: string[];
};

export type GatewayConfig = {
  agents: StoredAgent[];
};

export function configFilePath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".config", "exterior", "config.json");
}

export function parseGatewayConfig(value: unknown): GatewayConfig {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const items = Array.isArray(record.agents) ? record.agents : [];
  const agents: StoredAgent[] = [];
  for (const item of items) {
    const agent = parseStoredAgent(item);
    if (agent && !agents.some((existing) => existing.name === agent.name)) agents.push(agent);
  }
  return { agents };
}

function configText(config: GatewayConfig): string {
  return `${JSON.stringify({ agents: config.agents }, null, 2)}\n`;
}

export function defaultConfigText(): string {
  return configText({ agents: [] });
}

export async function readGatewayConfig(homeDirectory = homedir()): Promise<{
  agents: StoredAgent[];
  warning?: string;
}> {
  const loaded = await loadGatewayConfig(homeDirectory);
  const failure = loadFailure(loaded);
  if (failure) return { agents: [], warning: failure };
  if (loaded.kind === "parsed") return { agents: loaded.config.agents };
  return { agents: [] };
}

export async function readGatewayConfigForWrite(homeDirectory = homedir()): Promise<
  { ok: true; agents: StoredAgent[] } | { ok: false; message: string }
> {
  const loaded = await loadGatewayConfig(homeDirectory);
  const failure = loadFailure(loaded);
  if (failure) return { ok: false, message: failure };
  if (loaded.kind === "parsed" && loaded.dropsAgents) {
    return { ok: false, message: `Cannot rewrite ${loaded.path} without dropping agent entries.` };
  }
  return { ok: true, agents: loaded.kind === "parsed" ? loaded.config.agents : [] };
}

export async function writeGatewayConfig(config: GatewayConfig, homeDirectory = homedir()): Promise<void> {
  const path = configFilePath(homeDirectory);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Agent environment values can be API keys.
  await writeFile(path, configText(config), { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

type LoadedGatewayConfig =
  | { kind: "missing" }
  | { kind: "unreadable"; path: string }
  | { kind: "invalid"; path: string }
  | { kind: "parsed"; path: string; config: GatewayConfig; dropsAgents: boolean };

async function loadGatewayConfig(homeDirectory: string): Promise<LoadedGatewayConfig> {
  const path = configFilePath(homeDirectory);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return { kind: "missing" };
    return { kind: "unreadable", path };
  }
  try {
    const value: unknown = JSON.parse(text);
    return {
      kind: "parsed",
      path,
      config: parseGatewayConfig(value),
      dropsAgents: rewriteWouldDropAgents(value),
    };
  } catch {
    return { kind: "invalid", path };
  }
}

function loadFailure(loaded: LoadedGatewayConfig): string | undefined {
  if (loaded.kind === "unreadable") return `Cannot read ${loaded.path}.`;
  if (loaded.kind === "invalid") return `Cannot read ${loaded.path} as JSON.`;
  return undefined;
}

function rewriteWouldDropAgents(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
  const agents = (value as { agents?: unknown }).agents;
  if (!Array.isArray(agents)) return true;
  return parseGatewayConfig(value).agents.length !== agents.length;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function parseStoredAgent(value: unknown): StoredAgent | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.trim().length === 0) return undefined;
  if (typeof record.agentType !== "string" || !isAgentType(record.agentType)) return undefined;
  const env = parseEnv(record.env);
  if (!env) return undefined;
  const command = parseCommand(record.command, record.args);
  if (command === "invalid") return undefined;
  if (!command) return { name: record.name, agentType: record.agentType, env };
  return { name: record.name, agentType: record.agentType, env, command: command.command, args: command.args };
}

function parseCommand(command: unknown, args: unknown): { command: string; args: string[] } | "invalid" | undefined {
  if (command === undefined && args === undefined) return undefined;
  if (typeof command !== "string" || command.length === 0) return "invalid";
  if (args === undefined) return { command, args: [] };
  if (!Array.isArray(args) || args.some((item) => typeof item !== "string")) return "invalid";
  return { command, args };
}

function parseEnv(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const env: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isEnvName(key) || typeof item !== "string") return undefined;
    env[key] = item;
  }
  return env;
}
