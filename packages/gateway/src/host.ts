import { carryAgent, createDeviceHost, type AgentHooks, type AgentPipe, type AgentSlot, type DaemonMessage, type DevicePlatform } from "@exterioragentprotocol/sdk/device";
import type { AgentLaunch } from "./acp-registry.js";
import type { StoredAgent } from "./config.js";
import { startProcess } from "./launch.js";

/** A device host that offers the configured agents it can launch, and starts each as its own process. */
export function createDaemonHost(input: {
  hostname: string;
  platform: DevicePlatform;
  deviceId: string;
  workingDirectory: string;
  agents: readonly StoredAgent[];
  send: (message: DaemonMessage) => void;
  resolveLaunch: (agent: StoredAgent) => AgentLaunch | undefined;
  spawnAgent?: (launch: AgentLaunch, hooks: AgentHooks, workingDirectory: string) => AgentPipe;
}) {
  let configured = input.agents;
  const offered = (): AgentSlot[] =>
    configured.flatMap((agent) => (input.resolveLaunch(agent) ? [{ name: agent.name, agentType: agent.agentType }] : []));
  const host = createDeviceHost({
    hostname: input.hostname,
    platform: input.platform,
    deviceId: input.deviceId,
    workingDirectory: input.workingDirectory,
    agents: offered(),
    send: input.send,
    launch(agentName, hooks, workingDirectory) {
      const agent = configured.find((item) => item.name === agentName);
      const launch = agent ? input.resolveLaunch(agent) : undefined;
      return launch ? (input.spawnAgent ?? startAgent)(launch, hooks, workingDirectory) : undefined;
    },
  });
  return {
    ...host,
    setAgents(agents: readonly StoredAgent[]) {
      configured = agents;
      host.setAgents(offered());
    },
  };
}

export function startAgent(launch: AgentLaunch, hooks: AgentHooks, workingDirectory: string): AgentPipe {
  let started: ReturnType<typeof startProcess>;
  try {
    started = startProcess({
      executable: launch.executable,
      args: launch.args,
      env: { ...process.env, ...launch.env },
      workingDirectory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The agent did not start.";
    queueMicrotask(() => {
      hooks.onFail(message);
      hooks.onClose();
    });
    return { write() {}, stop() {} };
  }
  return carryAgent(started.child, hooks, started.stop);
}
