export type CliCommand =
  | { kind: "register" }
  | { kind: "open"; launchUrl: string }
  | { kind: "list-agent-configs" }
  | { kind: "create-agent-config"; agentType: string; name?: string; env: Record<string, string> }
  | { kind: "invalid" };

export function parseCliArgs(args: readonly string[]): CliCommand {
  const [command, subcommand, ...rest] = args;
  if (command === "register" && args.length === 1) return { kind: "register" };
  if (command === "open" && args.length === 2 && subcommand) return { kind: "open", launchUrl: subcommand };
  if (command === "agent-config" && subcommand === "list" && rest.length === 0) return { kind: "list-agent-configs" };
  if (command === "agent-config" && subcommand === "create") return parseCreateArgs(rest);
  return { kind: "invalid" };
}

export async function runCli(
  args: readonly string[],
  actions: {
    register: () => Promise<void>;
    open: (launchUrl: string) => Promise<void>;
    listAgentConfigs: () => Promise<void>;
    createAgentConfig: (input: {
      agentType: string;
      name?: string;
      env: Record<string, string>;
    }) => Promise<number>;
  },
): Promise<{ exitCode: number; showUsage: boolean }> {
  const parsed = parseCliArgs(args);
  if (parsed.kind === "register") {
    await actions.register();
    return { exitCode: 0, showUsage: false };
  }
  if (parsed.kind === "open") {
    await actions.open(parsed.launchUrl);
    return { exitCode: 0, showUsage: false };
  }
  if (parsed.kind === "list-agent-configs") {
    await actions.listAgentConfigs();
    return { exitCode: 0, showUsage: false };
  }
  if (parsed.kind === "create-agent-config") {
    const exitCode = await actions.createAgentConfig({
      agentType: parsed.agentType,
      name: parsed.name,
      env: parsed.env,
    });
    return { exitCode, showUsage: false };
  }
  return { exitCode: 1, showUsage: true };
}

function parseCreateArgs(args: readonly string[]): CliCommand {
  let agentType: string | undefined;
  let name: string | undefined;
  const env: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if ((flag === "--agent-type" || flag === "--name" || flag === "--env") && (!value || value.startsWith("--"))) {
      return { kind: "invalid" };
    }
    if (flag === "--agent-type") {
      if (agentType !== undefined || value === undefined) return { kind: "invalid" };
      agentType = value;
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
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { kind: "invalid" };
      env[key] = value.slice(separator + 1);
      index += 1;
      continue;
    }
    return { kind: "invalid" };
  }
  if (!agentType) return { kind: "invalid" };
  return { kind: "create-agent-config", agentType, name, env };
}
