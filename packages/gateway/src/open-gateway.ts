import { parseLaunchUrl, selectAgentSlots } from "@mukae/contract";
import { launchForAgentType, type AgentLaunch } from "./agents.js";
import { commandOnPath, readLoginPath } from "./launch-path.js";
import { chooseNameFromSystemDialog } from "./choose-name.js";
import { readGatewayConfig, type StoredAgent } from "./config.js";
import { startGatewayServer, type AgentProcess, type GatewayServer } from "./server.js";

const defaultIdleTimeoutMs = 90_000;

export type GatewaySessionOptions = {
  homeDirectory?: string;
  port?: number;
  idleTimeoutMs?: number;
  chooseName?: (agentType: string, names: readonly string[]) => Promise<string | undefined>;
  commandPath?: string;
  warn?: (message: string) => void;
};

export async function openGateway(launchUrl: string, options?: GatewaySessionOptions): Promise<void> {
  const session = await startGatewaySession(launchUrl, options);
  await session.finished;
}

export async function startGatewaySession(
  launchUrl: string,
  options: GatewaySessionOptions = {},
): Promise<GatewayServer> {
  const launch = parseLaunchUrl(launchUrl);
  if (!launch) throw new Error("The launch URL is not a mukae connect URL.");
  const commandPath = options.commandPath ?? readLoginPath();
  const loaded = await readGatewayConfig(options.homeDirectory);
  if (loaded.warning) (options.warn ?? ((message: string) => console.error(message)))(loaded.warning);
  const config = { agents: loaded.agents };
  const launchCommand = launchForAgentType(launch.agentType);
  const selection = launchCommand
    ? selectAgentSlots({ agentType: launch.agentType, slots: config.agents })
    : { result: "unconfigured" as const };
  const shared = {
    expectedNonce: launch.nonce,
    expectedOrigin: launch.origin,
    port: options.port ?? launch.port,
    idleTimeoutMs: options.idleTimeoutMs ?? defaultIdleTimeoutMs,
  };

  if (!launchCommand || selection.result === "unconfigured") {
    return startGatewayServer({ ...shared, initial: { status: "unconfigured" } });
  }

  if (selection.result === "use") {
    const stored = config.agents.find((agent) => agent.name === selection.name);
    if (!stored) return startGatewayServer({ ...shared, initial: { status: "unconfigured" } });
    return startGatewayServer({
      ...shared,
      initial: { status: "waiting", agent: processFor(launchCommand, stored, commandPath) },
    });
  }

  const server = await startGatewayServer({ ...shared, initial: { status: "choosing" } });
  void applyChoice({
    server,
    agentType: launch.agentType,
    names: selection.names,
    agents: config.agents,
    launchCommand,
    commandPath,
    chooseName: options.chooseName ?? chooseNameFromSystemDialog,
  });
  return server;
}

async function applyChoice(input: {
  server: GatewayServer;
  agentType: string;
  names: readonly string[];
  agents: readonly StoredAgent[];
  launchCommand: AgentLaunch;
  commandPath: string;
  chooseName: (agentType: string, names: readonly string[]) => Promise<string | undefined>;
}): Promise<void> {
  try {
    const chosenName = await input.chooseName(input.agentType, input.names);
    const stored = input.agents.find((agent) => agent.name === chosenName && agent.agentType === input.agentType);
    if (!stored) {
      input.server.finishChoice(undefined);
      return;
    }
    input.server.finishChoice(processFor(input.launchCommand, stored, input.commandPath));
  } catch {
    input.server.finishChoice(undefined);
  }
}

function processFor(launchCommand: AgentLaunch, stored: StoredAgent, commandPath: string): AgentProcess {
  const pathValue = stored.env.PATH ?? commandPath;
  return {
    command: commandOnPath(launchCommand.command, pathValue),
    args: launchCommand.args,
    env: pathValue ? { PATH: pathValue, ...stored.env } : stored.env,
  };
}
