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
  // Each agent is resolved once per configuration, so the device launches exactly what it offered.
  function resolveAll(agents: readonly StoredAgent[]): Map<string, { agent: StoredAgent; launch: AgentLaunch }> {
    return new Map(
      agents.flatMap((agent) => {
        const launch = input.resolveLaunch(agent);
        return launch ? [[agent.name, { agent, launch }] as const] : [];
      }),
    );
  }
  let launchable = resolveAll(input.agents);
  const offered = (): AgentSlot[] => [...launchable.values()].map(({ agent }) => ({ name: agent.name, agentType: agent.agentType }));
  const host = createDeviceHost({
    relayUrl: input.relayUrl,
    deviceKey: input.deviceKey,
    hostname: input.hostname,
    platform: input.platform,
    workingDirectory: input.workingDirectory,
    agents: offered(),
    heartbeatMs: input.heartbeatMs,
    launch(agentName, workingDirectory) {
      const offer = launchable.get(agentName);
      if (!offer) return "That agent is not configured.";
      return (input.spawnAgent ?? startAgent)(offer.launch, workingDirectory);
    },
  });
  return {
    ...host,
    setAgents(agents: readonly StoredAgent[]) {
      launchable = resolveAll(agents);
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
