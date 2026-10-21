import { createDeviceHost, type AgentSlot, type DeviceKey, type DevicePlatform, type StartedAgent } from "@exterioragentprotocol/sdk/device";
import type { AgentLaunch } from "./acp-registry.js";
import type { StoredAgent } from "./config.js";
import { startProcess } from "./launch.js";

/** A device host that offers the configured agents it can launch, and starts each as its own process. */
export function createDaemonHost(input: {
  relayUrl: string;
  deviceKey: DeviceKey;
  hostname: string;
  platform: DevicePlatform;
  workingDirectory: string;
  agents: readonly StoredAgent[];
  resolveLaunch: (agent: StoredAgent) => AgentLaunch | undefined;
  spawnAgent?: (launch: AgentLaunch, workingDirectory: string) => StartedAgent | string;
  heartbeatMs?: number;
}) {
  let configured = input.agents;
  const offered = (): AgentSlot[] =>
    configured.flatMap((agent) => (input.resolveLaunch(agent) ? [{ name: agent.name, agentType: agent.agentType }] : []));
  const host = createDeviceHost({
    relayUrl: input.relayUrl,
    deviceKey: input.deviceKey,
    hostname: input.hostname,
    platform: input.platform,
    workingDirectory: input.workingDirectory,
    agents: offered(),
    heartbeatMs: input.heartbeatMs,
    launch(agentName, workingDirectory) {
      const agent = configured.find((item) => item.name === agentName);
      const launch = agent ? input.resolveLaunch(agent) : undefined;
      return launch ? (input.spawnAgent ?? startAgent)(launch, workingDirectory) : "That agent is not configured.";
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

export function startAgent(launch: AgentLaunch, workingDirectory: string): StartedAgent | string {
  try {
    return startProcess({
      executable: launch.executable,
      args: launch.args,
      env: { ...process.env, ...launch.env },
      workingDirectory,
    });
  } catch (error) {
    return error instanceof Error ? error.message : "The agent did not start.";
  }
}
