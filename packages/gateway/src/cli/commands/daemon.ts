import { hostname } from "node:os";
import { acpRegistryCachePath, loadAcpRegistry } from "../../acp-registry.js";
import { readGatewayConfig } from "../../config.js";
import { runDaemon } from "../../daemon.js";
import { usableSignIn } from "../../login.js";
import { defineCommand } from "../command.js";
import { relayOption, resolveRelay } from "../relay.js";

export const daemon = defineCommand({
  name: "daemon",
  description: "Keep this machine connected to a relay and run its agents",
  help: [
    "Keep an outbound connection to one relay and start an agent for each connection a web app opens. Connection, refresh, and retry messages go to stderr.",
    "One daemon serves one relay. Run a second daemon to serve a second relay.",
  ].join("\n\n"),
  options: [relayOption],
  examples: ["mukae daemon", "mukae daemon --relay relay.example.com"],
  async action(context, options) {
    const { io } = context;
    const chosen = await resolveRelay(context, options, "daemon");
    if (!chosen.ok) {
      io.stderr.write(`${chosen.message}\n`);
      return 1;
    }
    const { relayUrl } = chosen;
    const inform = (line: string) => io.stderr.write(`${new Date().toISOString()} [mukae] ${line}\n`);
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    if (config.agents.length === 0) {
      io.stderr.write("No agent configurations.\nNext: mukae agent-config create --agent-type opencode\n");
      return 1;
    }
    const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(io.homeDirectory) });
    if (!registry.ok) io.stderr.write(`${registry.message}\n`);
    try {
      await runDaemon({
        relayUrl,
        getAccessToken: async (forceRefresh, signal) =>
          (await usableSignIn({ relayUrl, homeDirectory: io.homeDirectory, forceRefresh, signal })).accessToken,
        inform,
        hostname: hostname(),
        agents: config.agents,
        signal: context.signal,
        catalog: registry.ok ? registry.agents : [],
      });
      return 0;
    } catch (error) {
      inform(error instanceof Error ? error.message : "The daemon stopped.");
      return 1;
    }
  },
});
