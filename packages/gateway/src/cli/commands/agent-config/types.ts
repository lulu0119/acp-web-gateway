import { acpRegistryCachePath, formatRegistryAgents, launchForEntry, loadAcpRegistry, platformTarget } from "../../../acp-registry.js";
import { defineCommand } from "../../command.js";

export const types = defineCommand({
  name: "types",
  description: "Print the agent types in the ACP Registry",
  help: "Print the agent types in the ACP Registry. --json also says whether each one can start on this device, and why not.",
  options: [{ flags: "--json", description: "Print JSON" }],
  async action({ io }, options) {
    const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(io.homeDirectory) });
    if (!registry.ok) {
      io.stderr.write(`${registry.message}\n`);
      return 1;
    }
    if (!options.json) {
      io.stdout.write(formatRegistryAgents(registry.agents));
      return 0;
    }
    const platform = platformTarget();
    const types = registry.agents.map((entry) => {
      const launch = launchForEntry({ entry, platform });
      return {
        id: entry.id,
        name: entry.name,
        ...(entry.description ? { description: entry.description } : {}),
        ...(launch.ok ? { ready: true } : { ready: false, reason: launch.message }),
      };
    });
    io.stdout.write(`${JSON.stringify({ types }, null, 2)}\n`);
    return 0;
  },
});
