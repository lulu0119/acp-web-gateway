import { isEnvName } from "@exterior/contract";
import { isAgentType } from "@exterioragentprotocol/sdk";
import { mkdirSync, watch } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";

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
 * Creating it is the check.
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Configuration must be an object.");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "agents" && key !== "workingDirectory") throw new Error(`Unknown field "${key}".`);
  }
  if (!Array.isArray(record.agents)) throw new Error(`"agents" must be a list.`);
  const agents: StoredAgent[] = [];
  const names = new Set<string>();
  for (const [index, item] of record.agents.entries()) {
    const agent = parseStoredAgent(item, index);
    if (names.has(agent.name)) throw new Error(`agents[${index}] names "${agent.name}" twice.`);
    names.add(agent.name);
    agents.push(agent);
  }
  if (record.workingDirectory === undefined) return { agents };
  if (typeof record.workingDirectory !== "string" || record.workingDirectory.trim().length === 0) {
    throw new Error(`"workingDirectory" must be a non-empty path.`);
  }
  const workingDirectory = record.workingDirectory.trim();
  if (!isAbsolute(workingDirectory)) throw new Error(`"workingDirectory" must be absolute.`);
  return { agents, workingDirectory };
}

function configText(config: GatewayConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function readGatewayConfig(homeDirectory = homedir()): Promise<GatewayConfig & { warning?: string }> {
  const loaded = await loadGatewayConfig(homeDirectory);
  const failure = loadFailure(loaded);
  if (failure) return { agents: [], warning: failure };
  if (loaded.kind === "parsed") return loaded.config;
  return { agents: [] };
}

export async function writeGatewayConfig(config: GatewayConfig, homeDirectory = homedir()): Promise<void> {
  const path = configFilePath(homeDirectory);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Agent environment values can be API keys.
  await writeFile(path, configText(config), { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

/**
 * Calls `onChange` each time the configuration file settles on different content.
 *
 * The watch is on the directory, not the file: an editor that saves by renaming a new
 * file over the old one leaves a watch on the old file deaf. Events arrive in bursts,
 * so the file is read once they stop. A file that cannot be read keeps the previous configuration.
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
  | { kind: "invalid"; path: string; message: string }
  | { kind: "parsed"; path: string; config: GatewayConfig };

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
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "invalid", path, message: `Cannot read ${path} as JSON.` };
  }
  try {
    return { kind: "parsed", path, config: parseGatewayConfig(value) };
  } catch (error) {
    return { kind: "invalid", path, message: `Cannot read ${path}: ${error instanceof Error ? error.message : "invalid configuration."}` };
  }
}

function loadFailure(loaded: LoadedGatewayConfig): string | undefined {
  if (loaded.kind === "unreadable") return `Cannot read ${loaded.path}.`;
  if (loaded.kind === "invalid") return loaded.message;
  return undefined;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function parseStoredAgent(value: unknown, index: number): StoredAgent {
  const where = `agents[${index}]`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${where} must be an object.`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "name" && key !== "agentType" && key !== "env" && key !== "command" && key !== "args") {
      throw new Error(`${where} has unknown field "${key}".`);
    }
  }
  if (typeof record.name !== "string" || record.name.trim().length === 0) throw new Error(`${where} needs a name.`);
  if (typeof record.agentType !== "string" || !isAgentType(record.agentType)) {
    throw new Error(`${where} has unknown agent type ${JSON.stringify(record.agentType)}.`);
  }
  const env = parseEnv(record.env, where);
  const command = parseCommand(record.command, record.args, where);
  if (!command) return { name: record.name, agentType: record.agentType, env };
  return { name: record.name, agentType: record.agentType, env, command: command.command, args: command.args };
}

function parseCommand(command: unknown, args: unknown, where: string): { command: string; args: string[] } | undefined {
  if (command === undefined && args === undefined) return undefined;
  if (typeof command !== "string" || command.length === 0) throw new Error(`${where} needs a command.`);
  if (args === undefined) return { command, args: [] };
  if (!Array.isArray(args)) throw new Error(`${where} needs args as a list of strings.`);
  const list: string[] = [];
  for (const item of args) {
    if (typeof item !== "string") throw new Error(`${where} needs args as a list of strings.`);
    list.push(item);
  }
  return { command, args: list };
}

function parseEnv(value: unknown, where: string): Record<string, string> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${where} needs env as an object.`);
  const env: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isEnvName(key) || typeof item !== "string") throw new Error(`${where} has invalid env entry "${key}".`);
    env[key] = item;
  }
  return env;
}
