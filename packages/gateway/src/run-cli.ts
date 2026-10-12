import { isEnvName } from "@mukae/contract";

export type CliCommand =
  | { kind: RelayCommand; relayUrl?: string }
  | { kind: "status" }
  | { kind: "list-agent-configs" }
  | { kind: "list-agent-types" }
  | { kind: "create-agent-config"; agentType?: string; command?: string; name?: string; env: Record<string, string> }
  | { kind: "invalid" };

type RelayCommand = "login" | "logout" | "daemon";

export function parseCliArgs(args: readonly string[]): CliCommand {
  const [command, ...rest] = args;
  if (command === "login") return parseRelayCommand("login", rest);
  if (command === "logout") return parseRelayCommand("logout", rest);
  if (command === "daemon") return parseRelayCommand("daemon", rest);
  if (command === "status" && rest.length === 0) return { kind: "status" };
  if (command === "agent-config" && rest[0] === "list" && rest.length === 1) return { kind: "list-agent-configs" };
  if (command === "agent-config" && rest[0] === "types" && rest.length === 1) return { kind: "list-agent-types" };
  if (command === "agent-config" && rest[0] === "create") return parseCreateArgs(rest.slice(1));
  return { kind: "invalid" };
}

export async function runCli(
  args: readonly string[],
  actions: {
    login: (relayUrl?: string) => Promise<number>;
    logout: (relayUrl?: string) => Promise<number>;
    daemon: (relayUrl?: string) => Promise<number>;
    status: () => Promise<number>;
    listAgentConfigs: () => Promise<number>;
    listAgentTypes: () => Promise<number>;
    createAgentConfig: (input: { agentType?: string; command?: string; name?: string; env: Record<string, string> }) => Promise<number>;
  },
): Promise<{ exitCode: number; showUsage: boolean }> {
  const parsed = parseCliArgs(args);
  if (parsed.kind === "login") return { exitCode: await actions.login(parsed.relayUrl), showUsage: false };
  if (parsed.kind === "logout") return { exitCode: await actions.logout(parsed.relayUrl), showUsage: false };
  if (parsed.kind === "daemon") return { exitCode: await actions.daemon(parsed.relayUrl), showUsage: false };
  if (parsed.kind === "status") return { exitCode: await actions.status(), showUsage: false };
  if (parsed.kind === "list-agent-configs") return { exitCode: await actions.listAgentConfigs(), showUsage: false };
  if (parsed.kind === "list-agent-types") return { exitCode: await actions.listAgentTypes(), showUsage: false };
  if (parsed.kind === "create-agent-config") {
    return { exitCode: await actions.createAgentConfig(parsed), showUsage: false };
  }
  return { exitCode: 1, showUsage: true };
}

function parseRelayCommand(kind: RelayCommand, args: readonly string[]): CliCommand {
  if (args.length === 0) return { kind };
  if (args.length !== 2 || args[0] !== "--relay" || !args[1]) return { kind: "invalid" };
  const relayUrl = parseRelayUrl(args[1]);
  return relayUrl ? { kind, relayUrl } : { kind: "invalid" };
}

/** Reads a relay origin. A bare host means https, except a loopback host, which means http. */
export function parseRelayUrl(text: string): string | undefined {
  if (text.startsWith("--")) return undefined;
  const loopback = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/.test(text);
  if (!text.includes("://") && !loopback && !/^[\w-]+(\.[\w-]+)+(:\d+)?$/.test(text)) return undefined;
  try {
    const url = new URL(text.includes("://") ? text : `${loopback ? "http" : "https"}://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function parseCreateArgs(args: readonly string[]): CliCommand {
  let agentType: string | undefined;
  let command: string | undefined;
  let name: string | undefined;
  const env: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if ((flag === "--agent-type" || flag === "--name" || flag === "--env" || flag === "--command") && (!value || value.startsWith("--"))) {
      return { kind: "invalid" };
    }
    if (flag === "--agent-type") {
      if (agentType !== undefined || value === undefined) return { kind: "invalid" };
      agentType = value;
      index += 1;
      continue;
    }
    if (flag === "--command") {
      if (command !== undefined || value === undefined) return { kind: "invalid" };
      command = value;
      index += 1;
      continue;
    }
    if (flag === "--name") {
      if (name !== undefined || value === undefined) return { kind: "invalid" };
      name = value;
      index += 1;
      continue;
    }
    if (flag === "--env") {
      if (value === undefined) return { kind: "invalid" };
      const separator = value.indexOf("=");
      const key = separator > 0 ? value.slice(0, separator) : "";
      if (!isEnvName(key)) return { kind: "invalid" };
      env[key] = value.slice(separator + 1);
      index += 1;
      continue;
    }
    return { kind: "invalid" };
  }
  if (agentType && command) return { kind: "invalid" };
  if (!agentType && !command) return { kind: "invalid" };
  return { kind: "create-agent-config", agentType, command, name, env };
}
