import { defaultRelayUrl, isEnvName } from "@mukae/contract";

export type CliCommand =
  | { kind: "login"; relayUrl: string }
  | { kind: "daemon"; relayUrl: string }
  | { kind: "list-agent-configs" }
  | { kind: "list-agent-types" }
  | { kind: "create-agent-config"; agentType?: string; command?: string; name?: string; env: Record<string, string> }
  | { kind: "invalid" };

export function parseCliArgs(args: readonly string[]): CliCommand {
  const [command, ...rest] = args;
  if (command === "login") return parseRelayCommand("login", rest);
  if (command === "daemon") return parseRelayCommand("daemon", rest);
  if (command === "agent-config" && rest[0] === "list" && rest.length === 1) return { kind: "list-agent-configs" };
  if (command === "agent-config" && rest[0] === "types" && rest.length === 1) return { kind: "list-agent-types" };
  if (command === "agent-config" && rest[0] === "create") return parseCreateArgs(rest.slice(1));
  return { kind: "invalid" };
}

export async function runCli(
  args: readonly string[],
  actions: {
    login: (relayUrl: string) => Promise<number>;
    daemon: (relayUrl: string) => Promise<number>;
    listAgentConfigs: () => Promise<number>;
    listAgentTypes: () => Promise<number>;
    createAgentConfig: (input: { agentType?: string; command?: string; name?: string; env: Record<string, string> }) => Promise<number>;
  },
): Promise<{ exitCode: number; showUsage: boolean }> {
  const parsed = parseCliArgs(args);
  if (parsed.kind === "login") return { exitCode: await actions.login(parsed.relayUrl), showUsage: false };
  if (parsed.kind === "daemon") return { exitCode: await actions.daemon(parsed.relayUrl), showUsage: false };
  if (parsed.kind === "list-agent-configs") return { exitCode: await actions.listAgentConfigs(), showUsage: false };
  if (parsed.kind === "list-agent-types") return { exitCode: await actions.listAgentTypes(), showUsage: false };
  if (parsed.kind === "create-agent-config") {
    return { exitCode: await actions.createAgentConfig(parsed), showUsage: false };
  }
  return { exitCode: 1, showUsage: true };
}

function parseRelayCommand(kind: "login" | "daemon", args: readonly string[]): CliCommand {
  if (args.length === 0) return { kind, relayUrl: defaultRelayUrl };
  if (args.length === 2 && args[0] === "--relay" && args[1] && !args[1].startsWith("--")) {
    try {
      const url = new URL(args[1]);
      if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "invalid" };
      return { kind, relayUrl: url.origin };
    } catch {
      return { kind: "invalid" };
    }
  }
  return { kind: "invalid" };
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
