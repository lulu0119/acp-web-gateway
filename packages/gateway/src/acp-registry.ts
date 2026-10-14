import { isEnvName, isRecord } from "@exterior/contract";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { StoredAgent } from "./config.js";
import { resolveCommand, type Executable } from "./launch.js";

export const acpRegistryUrl = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

const cacheMaxAgeMs = 60 * 60 * 1000;

const platformTargets: Record<string, string> = {
  "darwin-arm64": "darwin-aarch64",
  "darwin-x64": "darwin-x86_64",
  "linux-arm64": "linux-aarch64",
  "linux-x64": "linux-x86_64",
  "win32-arm64": "windows-aarch64",
  "win32-x64": "windows-x86_64",
};

export type RegistryAgent = {
  id: string;
  name: string;
  npx?: PackageDistribution;
  uvx?: PackageDistribution;
  binary?: Readonly<Record<string, BinaryDistribution>>;
};

type PackageDistribution = {
  package: string;
  args: readonly string[];
  env: Record<string, string>;
};

type BinaryDistribution = {
  cmd: string;
  args: readonly string[];
  env: Record<string, string>;
};

/** The file to start for an agent configuration, resolved on this machine. */
export type AgentLaunch = {
  executable: Executable;
  args: readonly string[];
  env: Record<string, string>;
};

type Resolve = (command: string) => Executable | undefined;

const resolveOnThisMachine: Resolve = (command) => resolveCommand(command);

export function acpRegistryCachePath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".config", "exterior", "acp-registry.json");
}

export function platformTarget(platform = process.platform, arch = process.arch): string | undefined {
  return platformTargets[`${platform}-${arch}`];
}

export function parseRegistryAgents(text: string): RegistryAgent[] | undefined {
  try {
    return agentsFromValue(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

export async function loadAcpRegistry(input?: {
  cachePath?: string;
  fetchText?: () => Promise<string>;
  now?: number;
}): Promise<{ ok: true; agents: RegistryAgent[] } | { ok: false; message: string }> {
  const cachePath = input?.cachePath ?? acpRegistryCachePath();
  const now = input?.now ?? Date.now();
  const fetchText = input?.fetchText ?? (() => fetchRegistryText());
  const cached = await readCache(cachePath);
  const fresh = cached && now - cached.mtimeMs < cacheMaxAgeMs ? parseRegistryAgents(cached.text) : undefined;
  if (fresh) return { ok: true, agents: fresh };
  try {
    const text = await fetchText();
    const agents = parseRegistryAgents(text);
    if (agents) {
      try {
        await writeCache(cachePath, text);
      } catch {
        // The fetched list is still usable when the cache cannot be written.
      }
      return { ok: true, agents };
    }
  } catch {
    // The cache below is the copy from the last successful fetch.
  }
  const stale = cached ? parseRegistryAgents(cached.text) : undefined;
  if (stale) return { ok: true, agents: stale };
  return { ok: false, message: "Cannot read the ACP registry." };
}

export function launchForEntry(input: {
  entry: RegistryAgent;
  platform: string | undefined;
  resolve?: Resolve;
  userEnv?: Record<string, string>;
}): { ok: true; launch: AgentLaunch } | { ok: false; message: string } {
  const resolve = input.resolve ?? resolveOnThisMachine;
  if (input.entry.npx) return packageLaunch("npx", input.entry.npx, resolve, input.userEnv);
  if (input.entry.uvx) return packageLaunch("uvx", input.entry.uvx, resolve, input.userEnv);
  const binary = input.platform ? input.entry.binary?.[input.platform] : undefined;
  if (binary) return binaryLaunch(binary, resolve, input.userEnv);
  if (input.entry.binary) return { ok: false, message: `Agent type "${input.entry.id}" has no build for this platform.` };
  return { ok: false, message: `Agent type "${input.entry.id}" has no launch method.` };
}

export function resolveStoredAgent(input: {
  agent: StoredAgent;
  agents: readonly RegistryAgent[];
  platform: string | undefined;
  resolve?: Resolve;
}): AgentLaunch | undefined {
  const resolve = input.resolve ?? resolveOnThisMachine;
  if (input.agent.command) {
    const executable = resolve(input.agent.command);
    return executable ? { executable, args: input.agent.args ?? [], env: input.agent.env } : undefined;
  }
  const entry = input.agents.find((agent) => agent.id === input.agent.agentType);
  if (!entry) return undefined;
  const launch = launchForEntry({ entry, platform: input.platform, resolve, userEnv: input.agent.env });
  return launch.ok ? launch.launch : undefined;
}

export function formatRegistryAgents(agents: readonly RegistryAgent[]): string {
  if (agents.length === 0) return "No agents in the ACP registry.\n";
  return `${agents.map((agent) => `${agent.id}\t${agent.name}`).join("\n")}\n`;
}

function packageLaunch(
  command: "npx" | "uvx",
  distribution: PackageDistribution,
  resolve: Resolve,
  userEnv: Record<string, string> | undefined,
): { ok: true; launch: AgentLaunch } | { ok: false; message: string } {
  const executable = resolve(command);
  if (!executable) return { ok: false, message: `"${command}" is not installed.` };
  const args = command === "npx" ? ["-y", distribution.package, ...distribution.args] : [distribution.package, ...distribution.args];
  return { ok: true, launch: { executable, args, env: { ...distribution.env, ...userEnv } } };
}

function binaryLaunch(
  distribution: BinaryDistribution,
  resolve: Resolve,
  userEnv: Record<string, string> | undefined,
): { ok: true; launch: AgentLaunch } | { ok: false; message: string } {
  const command = commandName(distribution.cmd);
  if (!command) return { ok: false, message: "The registry command is not a file name." };
  const executable = resolve(command);
  if (!executable) return { ok: false, message: `"${command}" is not installed.` };
  return { ok: true, launch: { executable, args: distribution.args, env: { ...distribution.env, ...userEnv } } };
}

/**
 * The command a person installs, from the file a registry archive holds.
 *
 * `./dist/opencode.exe` names a file inside the archive. Exterior does not
 * unpack archives, so what runs is whatever the person installed as
 * `opencode`: an `opencode.exe`, or the `opencode.cmd` npm writes.
 */
function commandName(cmd: string): string | undefined {
  const base = cmd.replaceAll("\\", "/").split("/").pop() ?? "";
  if (base === "." || base === "..") return undefined;
  const stem = base.replace(/\.(exe|com|cmd|bat)$/i, "");
  return stem.length > 0 ? stem : undefined;
}

async function fetchRegistryText(): Promise<string> {
  const response = await fetch(acpRegistryUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`ACP registry responded ${response.status}.`);
  return response.text();
}

async function readCache(path: string): Promise<{ text: string; mtimeMs: number } | undefined> {
  try {
    const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    return { text, mtimeMs: info.mtimeMs };
  } catch {
    return undefined;
  }
}

async function writeCache(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

function agentsFromValue(value: unknown): RegistryAgent[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.agents)) return undefined;
  const agents: RegistryAgent[] = [];
  for (const item of value.agents) {
    const agent = parseAgent(item);
    if (agent && !agents.some((existing) => existing.id === agent.id)) agents.push(agent);
  }
  return agents;
}

function parseAgent(value: unknown): RegistryAgent | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return undefined;
  const name = typeof value.name === "string" && value.name.length > 0 ? value.name : value.id;
  const distribution = isRecord(value.distribution) ? value.distribution : {};
  const npx = parsePackage(distribution.npx);
  const uvx = parsePackage(distribution.uvx);
  const binary = parseBinary(distribution.binary);
  return { id: value.id, name, npx, uvx, binary };
}

function parsePackage(value: unknown): PackageDistribution | undefined {
  if (!isRecord(value) || typeof value.package !== "string" || value.package.length === 0) return undefined;
  const args = parseArgs(value.args);
  const env = parseDistributionEnv(value.env);
  if (!args || !env) return undefined;
  return { package: value.package, args, env };
}

function parseBinary(value: unknown): Record<string, BinaryDistribution> | undefined {
  if (!isRecord(value)) return undefined;
  const binary: Record<string, BinaryDistribution> = {};
  for (const [platform, item] of Object.entries(value)) {
    if (!isRecord(item) || typeof item.cmd !== "string" || item.cmd.length === 0) continue;
    const args = parseArgs(item.args);
    const env = parseDistributionEnv(item.env);
    if (!args || !env) continue;
    binary[platform] = { cmd: item.cmd, args, env };
  }
  return binary;
}

function parseArgs(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value;
}

function parseDistributionEnv(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {};
  if (!isRecord(value)) return undefined;
  const env: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isEnvName(key) && typeof item === "string") env[key] = item;
  }
  return env;
}
