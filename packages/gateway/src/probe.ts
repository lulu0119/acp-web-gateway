import { spawn } from "node:child_process";
import { addAgentConfig, launchForAgentType } from "./agents.js";
import type { StoredAgent } from "./config.js";
import { commandOnPath, firstMissingCommand } from "./launch-path.js";

const initializeLine =
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}\n';

export type ProbeOutcome =
  | { status: "ready" }
  | { status: "sign-in"; methods: string[] }
  | { status: "missing"; command: string }
  | { status: "failed"; reason: string };

export function interpretInitializeLine(line: string):
  | { ok: true; needsSignIn: boolean; methods: string[] }
  | { ok: false; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, reason: "The agent did not return JSON." };
  }
  if (typeof value !== "object" || value === null) return { ok: false, reason: "The agent did not return JSON." };
  const record = value as Record<string, unknown>;
  if (record.error !== undefined) return { ok: false, reason: "The agent rejected initialize." };
  const result = record.result;
  if (typeof result !== "object" || result === null) return { ok: false, reason: "The agent returned no result." };
  if ((result as { protocolVersion?: unknown }).protocolVersion !== 1) {
    return { ok: false, reason: "The agent protocol version is not 1." };
  }
  const methods = authMethodLabels((result as { authMethods?: unknown }).authMethods);
  return { ok: true, needsSignIn: methods.length > 0, methods };
}

export function firstInitializeLine(text: string): string | undefined {
  for (const piece of text.split("\n")) {
    const line = piece.trim();
    if (!line.startsWith("{")) continue;
    const interpreted = interpretInitializeLine(line);
    if (!interpreted.ok && interpreted.reason === "The agent did not return JSON.") continue;
    return line;
  }
  return undefined;
}

export async function probeInstalledAgent(
  agentType: string,
  pathValue: string,
  timeoutMs = 120_000,
): Promise<ProbeOutcome> {
  const launch = launchForAgentType(agentType);
  if (!launch) return { status: "failed", reason: `Unknown agent type "${agentType}".` };
  const missing = firstMissingCommand(launch.requires, pathValue);
  if (missing) return { status: "missing", command: missing };
  const handshake = await runInitializeHandshake({
    command: commandOnPath(launch.command, pathValue),
    args: launch.args,
    pathValue,
    timeoutMs,
  });
  if (!handshake.ok) {
    const detail = clip(handshake.stderr);
    return { status: "failed", reason: detail ? `${handshake.reason} ${detail}` : handshake.reason };
  }
  const interpreted = interpretInitializeLine(handshake.line);
  if (!interpreted.ok) {
    const detail = clip(handshake.stderr);
    return { status: "failed", reason: detail ? `${interpreted.reason} ${detail}` : interpreted.reason };
  }
  if (interpreted.needsSignIn) return { status: "sign-in", methods: interpreted.methods };
  return { status: "ready" };
}

export function planAgentConfigurations(input: {
  agents: readonly StoredAgent[];
  probes: readonly { agentType: string; outcome: ProbeOutcome | { status: "already" } }[];
  knownTypes: readonly string[];
}): { agents: StoredAgent[]; lines: string[]; needsSignIn: boolean } {
  let agents = [...input.agents];
  const lines: string[] = [];
  let needsSignIn = false;
  for (const probe of input.probes) {
    const outcome = probe.outcome;
    if (outcome.status === "already") {
      lines.push(`${probe.agentType}: already configured`);
      continue;
    }
    if (outcome.status === "ready") {
      const added = addAgentConfig({
        agents,
        agentType: probe.agentType,
        env: {},
        knownTypes: input.knownTypes,
      });
      if (!added.ok) {
        lines.push(`${probe.agentType}: ${added.message}`);
        continue;
      }
      agents = added.agents;
      lines.push(`${probe.agentType}: configured`);
      continue;
    }
    if (outcome.status === "sign-in") {
      const added = addAgentConfig({
        agents,
        agentType: probe.agentType,
        env: {},
        knownTypes: input.knownTypes,
      });
      if (!added.ok) {
        lines.push(`${probe.agentType}: ${added.message}`);
        continue;
      }
      agents = added.agents;
      needsSignIn = true;
      const methods = outcome.methods.length > 0 ? ` (${outcome.methods.join(", ")})` : "";
      lines.push(`${probe.agentType}: configured; sign-in available${methods}`);
      continue;
    }
    if (outcome.status === "missing") {
      lines.push(`${probe.agentType}: not installed (${outcome.command})`);
      continue;
    }
    lines.push(`${probe.agentType}: verification failed (${outcome.reason})`);
  }
  return { agents, lines, needsSignIn };
}

export function formatInstallReport(lines: readonly string[], needsSignIn: boolean): string {
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  const signIn = needsSignIn
    ? "Some agents listed a sign-in method. The configuration was still written.\n"
    : "";
  return `Installed mukae.\n${body}${signIn}Return to the web page, choose a type, click Connect, and allow the browser prompt.\n`;
}

async function runInitializeHandshake(input: {
  command: string;
  args: readonly string[];
  pathValue: string;
  timeoutMs: number;
}): Promise<{ ok: true; line: string; stderr: string } | { ok: false; reason: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(input.command, [...input.args], {
      env: input.pathValue ? { ...process.env, PATH: input.pathValue } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    let stderr = "";
    let line: string | undefined;
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: { ok: true; line: string; stderr: string } | { ok: false; reason: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, input.timeoutMs);
    child.stdin.on("error", () => undefined);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 1_000_000) {
        child.kill("SIGKILL");
        return;
      }
      const newline = buffer.lastIndexOf("\n");
      if (newline < 0) return;
      const found = firstInitializeLine(buffer.slice(0, newline));
      if (!found) return;
      line = found;
      child.kill("SIGKILL");
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish({ ok: false, reason: error.message, stderr });
    });
    child.on("close", () => {
      if (line) {
        finish({ ok: true, line, stderr });
        return;
      }
      const reason = timedOut
        ? `The agent did not answer within ${input.timeoutMs} milliseconds.`
        : "The agent exited without a response.";
      finish({ ok: false, reason, stderr });
    });
    child.stdin.write(initializeLine);
  });
}

function authMethodLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      labels.push(item);
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const record = item as { name?: unknown; id?: unknown };
    if (typeof record.name === "string" && record.name.length > 0) labels.push(record.name);
    else if (typeof record.id === "string" && record.id.length > 0) labels.push(record.id);
  }
  return labels;
}

function clip(text: string): string {
  const brief = text.trim().split("\n").slice(0, 4).join(" ");
  if (!brief) return "";
  return brief.length > 240 ? `${brief.slice(0, 240)}...` : brief;
}
