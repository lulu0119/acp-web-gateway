import { hostname } from "node:os";
import { acpRegistryCachePath, loadAcpRegistry } from "../../acp-registry.js";
import { readGatewayConfig, watchGatewayConfig, workingDirectoryPath, type StoredAgent } from "../../config.js";
import { daemonStateReporter } from "../../daemon-state.js";
import { runDaemon } from "../../daemon.js";
import { signedInDeviceId, usableSignIn } from "../../login.js";
import { defineCommand } from "../command.js";
import { relayOption, resolveRelay } from "../relay.js";

export const daemon = defineCommand({
  name: "daemon",
  description: "Keep this device connected to a relay and run its agents",
  help: [
    "Keep an outbound connection to one relay and start an agent for each connection a web app opens. Connection, refresh, and retry messages go to stderr.",
    "One daemon serves one relay. Run a second daemon to serve a second relay.",
    "A change to the agent configurations reaches the relay while the daemon runs. Sessions already open keep their agent.",
  ].join("\n\n"),
  options: [relayOption],
  examples: ["exterior daemon", "exterior daemon --relay relay.example.com"],
  async action(context, options) {
    const { io } = context;
    const chosen = await resolveRelay(context, options, "daemon");
    if (!chosen.ok) {
      io.stderr.write(`${chosen.message}\n`);
      return 1;
    }
    const { relayUrl } = chosen;
    const inform = (line: string) => io.stderr.write(`${new Date().toISOString()} [exterior] ${line}\n`);
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    // The daemon stays up without agents: one added later reaches the relay without a restart.
    if (config.agents.length === 0) {
      io.stderr.write("No agent configurations yet.\nNext: exterior agent-config create --agent-type opencode\n");
    }
    const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(io.homeDirectory) });
    if (!registry.ok) io.stderr.write(`${registry.message}\n`);
    const names = (agents: readonly StoredAgent[]) => agents.map((agent) => agent.name);
    const state = daemonStateReporter({ relayUrl, agents: names(config.agents), homeDirectory: io.homeDirectory });
    try {
      await runDaemon({
        relayUrl,
        getAccessToken: async (forceRefresh, signal) =>
          (await usableSignIn({ relayUrl, homeDirectory: io.homeDirectory, forceRefresh, signal })).accessToken,
        inform,
        onStatus: state.status,
        hostname: hostname(),
        deviceId: await signedInDeviceId(relayUrl, io.homeDirectory),
        workingDirectory: workingDirectoryPath(io.homeDirectory),
        agents: config.agents,
        agentUpdates: (listener) =>
          watchGatewayConfig({
            homeDirectory: io.homeDirectory,
            agents: config.agents,
            onChange(agents) {
              inform(`Agent configurations changed: ${names(agents).join(", ") || "none"}.`);
              state.agents(names(agents));
              listener(agents);
            },
            onWarning: inform,
          }),
        signal: context.signal,
        catalog: registry.ok ? registry.agents : [],
      });
      await state.stopped("The daemon was stopped.");
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The daemon stopped.";
      inform(message);
      await state.stopped(message);
      return 1;
    }
  },
});
