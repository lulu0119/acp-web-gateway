import { isAgentType } from "@mukae/contract";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type StoredAgent = {
  name: string;
  agentType: string;
  env: Record<string, string>;
};

export type GatewayConfig = {
  agents: StoredAgent[];
};

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function configFilePath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".config", "mukae", "config.json");
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

export function configText(config: GatewayConfig): string {
  return `${JSON.stringify({ agents: config.agents }, null, 2)}\n`;
}

export function defaultConfigText(): string {
  return configText({ agents: [] });
}

export async function readGatewayConfig(homeDirectory = homedir()): Promise<GatewayConfig> {
  try {
    const text = await readFile(configFilePath(homeDirectory), "utf8");
    return parseGatewayConfig(JSON.parse(text) as unknown);
  } catch {
    return { agents: [] };
  }
}

export async function writeGatewayConfig(config: GatewayConfig, homeDirectory = homedir()): Promise<void> {
  const path = configFilePath(homeDirectory);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, configText(config), "utf8");
}

export async function writeDefaultConfigIfMissing(homeDirectory = homedir()): Promise<void> {
  const path = configFilePath(homeDirectory);
  try {
    await readFile(path, "utf8");
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, defaultConfigText(), "utf8");
  }
}

function parseStoredAgent(value: unknown): StoredAgent | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.trim().length === 0) return undefined;
  if (typeof record.agentType !== "string" || !isAgentType(record.agentType)) return undefined;
  const env = parseEnv(record.env);
  if (!env) return undefined;
  return { name: record.name, agentType: record.agentType, env };
}

function parseEnv(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const env: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!envNamePattern.test(key) || typeof item !== "string") return undefined;
    env[key] = item;
  }
  return env;
}
