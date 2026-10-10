import { knownAgentTypes } from "./agents.js";
import { readGatewayConfigForWrite, writeGatewayConfig } from "./config.js";
import { formatInstallReport, planAgentConfigurations, probeInstalledAgent, type ProbeOutcome } from "./probe.js";
import { registerLocalGateway } from "./register.js";
import { copyGatewayRuntime, runtimeDirectory } from "./runtime.js";

export async function installLocalGateway(input: {
  homeDirectory: string;
  applicationSupportDirectory: string;
  sourceDistDirectory: string;
  nodePath: string;
  launcherBinaryPath: string;
  platform: NodeJS.Platform;
  pathValue: string;
  packages: readonly { name: string; directory: string }[];
  registerApplication?: (applicationPath: string) => Promise<void>;
  signApplication?: (applicationPath: string) => Promise<void>;
  probeAgentType?: (agentType: string, pathValue: string) => Promise<ProbeOutcome>;
  prepareTls?: () => Promise<void>;
  inform?: (message: string) => void;
  warn?: (message: string) => void;
}): Promise<void> {
  await input.prepareTls?.();
  const cliPath = await copyGatewayRuntime({
    sourceDistDirectory: input.sourceDistDirectory,
    destinationRoot: runtimeDirectory(input.applicationSupportDirectory),
    packages: input.packages,
  });
  await registerLocalGateway({
    homeDirectory: input.homeDirectory,
    applicationSupportDirectory: input.applicationSupportDirectory,
    nodePath: input.nodePath,
    cliPath,
    launcherBinaryPath: input.launcherBinaryPath,
    platform: input.platform,
    registerApplication: input.registerApplication,
    signApplication: input.signApplication,
    warn: input.warn,
    reportNextStep: false,
  });
  const probe = input.probeAgentType ?? probeInstalledAgent;
  const config = await readGatewayConfigForWrite(input.homeDirectory);
  if (!config.ok) {
    input.warn?.(config.message);
    input.inform?.(`Installed mukae.\n${config.message}\n`);
    return;
  }
  const probes: { agentType: string; outcome: ProbeOutcome | { status: "already" } }[] = [];
  for (const agentType of knownAgentTypes()) {
    if (config.agents.some((agent) => agent.agentType === agentType)) {
      probes.push({ agentType, outcome: { status: "already" } });
      continue;
    }
    probes.push({ agentType, outcome: await probe(agentType, input.pathValue) });
  }
  const planned = planAgentConfigurations({
    agents: config.agents,
    probes,
    knownTypes: knownAgentTypes(),
  });
  if (planned.agents.length !== config.agents.length) {
    await writeGatewayConfig({ agents: planned.agents }, input.homeDirectory);
  }
  input.inform?.(formatInstallReport(planned.lines, planned.needsSignIn));
}
