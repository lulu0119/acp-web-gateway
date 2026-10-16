import { isAgentType, isEnvName } from "@exterior/contract";
import { mkdirSync, watch } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export type StoredAgent = {
  name: string;
  agentType: string;
  env: Record<string, string>;
  command?: string;
  args?: string[];
};

export type GatewayConfig = {
  agents: StoredAgent[];
  /** Absolute. The directory sessions work in, or unset for `workingDirectoryPath`. */
  workingDirectory?: string;
};

export function configFilePath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".config", "exterior", "config.json");
}

/**
 * The directory the daemon runs agents in when the configuration names none.
 *
 * Sign-ins live in `~/.config/exterior`. This path is the data directory, the
 * same relative path on every system.
 */
export function workingDirectoryPath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".local", "share", "exterior", "workspace");
}

/** Where this device's sessions work: what the configuration names, or the default. */
export function configuredWorkingDirectory(config: GatewayConfig, homeDirectory = homedir()): string {
  return config.workingDirectory ?? workingDirectoryPath(homeDirectory);
}

/**
 * The directory if it can be worked in, or undefined after saying why.
 *
 * Creating it is the whole check: `mkdir` knows this system's rules, and its reason is
 * the only accurate one.
 */
export async function usableWorkingDirectory(directory: string, inform: (line: string) => void): Promise<string | undefined> {
  try {
    await mkdir(directory, { recursive: true });
    return directory;
  } catch (error) {
    inform(`Cannot use ${directory} as the working directory: ${error instanceof Error ? error.message : "no reason given"}`);
    return undefined;
  }
}

export function parseGatewayConfig(value: unknown): GatewayConfig {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const items = Array.isArray(record.agents) ? record.agents : [];
  const agents: StoredAgent[] = [];
  for (const item of items) {
    const agent = parseStoredAgent(item);
    if (agent && !agents.some((existing) => existing.name === agent.name)) agents.push(agent);
  }
  const workingDirectory = typeof record.workingDirectory === "string" ? record.workingDirectory.trim() : "";
  // A path is either given or absent. An empty string is absent, not a directory to work in.
  return workingDirectory.length > 0 ? { agents, workingDirectory } : { agents };
}

function configText(config: GatewayConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function defaultConfigText(): string {
  return configText({ agents: [] });
}

export async function readGatewayConfig(homeDirectory = homedir()): Promise<GatewayConfig & { warning?: string }> {
  const loaded = await loadGatewayConfig(homeDirectory);
  const failure = loadFailure(loaded);
  if (failure) return { agents: [], warning: failure };
  if (loaded.kind === "parsed") return loaded.config;
  return { agents: [] };
}

export async function readGatewayConfigForWrite(
  homeDirectory = homedir(),
): Promise<{ ok: true; config: GatewayConfig } | { ok: false; message: string }> {
  const loaded = await loadGatewayConfig(homeDirectory);
  const failure = loadFailure(loaded);
  if (failure) return { ok: false, message: failure };
  if (loaded.kind === "parsed" && loaded.dropsAgents) {
    return { ok: false, message: `Cannot rewrite ${loaded.path} without dropping agent entries.` };
  }
  // The whole configuration, so a writer adds or removes one thing and leaves the rest alone.
  return { ok: true, config: loaded.kind === "parsed" ? loaded.config : { agents: [] } };
}

export async function writeGatewayConfig(config: GatewayConfig, homeDirectory = homedir()): Promise<void> {
  const path = configFilePath(homeDirectory);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Agent environment values can be API keys.
  await writeFile(path, configText(config), { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

/**
 * Calls `onChange` each time the configuration file settles on a different agent list.
 *
 * The watch is on the directory, not the file: an editor that saves by renaming a new
 * file over the old one leaves a watch on the old file deaf. Events arrive in bursts,
 * so the file is read once they stop. A file that cannot be read keeps the previous list.
 * Returns a function that stops watching.
 */
export function watchGatewayConfig(input: {
  homeDirectory?: string;
  config: GatewayConfig;
  onChange: (config: GatewayConfig) => void;
  onWarning: (message: string) => void;
  settleMs?: number;
}): () => void {
  const path = configFilePath(input.homeDirectory);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let current = configKey(input.config);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const reload = async () => {
    const config = await readGatewayConfig(input.homeDirectory);
    if (stopped) return;
    if (config.warning) {
      input.onWarning(`${config.warning} Keeping the previous configuration.`);
      return;
    }
    const next = configKey(config);
    if (next === current) return;
    current = next;
    input.onChange(config);
  };
  const watcher = watch(dirname(path), (_event, filename) => {
    // Some platforms do not report the name; read the file anyway.
    if (filename && filename !== basename(path)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void reload(), input.settleMs ?? 250);
  });
  watcher.on("error", () => input.onWarning(`Stopped watching ${path}. Restart the daemon to pick up changes.`));
  return () => {
    stopped = true;
    clearTimeout(timer);
    watcher.close();
  };
}

type LoadedGatewayConfig =
  | { kind: "missing" }
  | { kind: "unreadable"; path: string }
  | { kind: "invalid"; path: string }
  | { kind: "parsed"; path: string; config: GatewayConfig; dropsAgents: boolean };

/** One spelling of a configuration, so a watch can tell a change from a rewrite of the same thing. */
function configKey(config: GatewayConfig): string {
  return JSON.stringify({ agents: config.agents, workingDirectory: config.workingDirectory ?? null });
}

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
