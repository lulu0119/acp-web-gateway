import { acpRegistryCachePath, formatRegistryAgents, launchForEntry, loadAcpRegistry, platformTarget } from "../../../acp-registry.js";
import { resolveCommand } from "../../../launch.js";
import { loginShellPath } from "../../../shell-path.js";
import { defineCommand, UsageError } from "../../command.js";

export const search = defineCommand({
  name: "search",
  description: "Print the agent types in the ACP Registry",
  help: "Print the agent types in the ACP Registry, or those whose id, name, or description holds the term. --json also says whether each one can start on this device, and why not.",
  options: [{ flags: "--json", description: "Print JSON" }],
  operands: ["[term]"],
  examples: ["exterior registry search", "exterior registry search claude"],
  async action({ io }, options, operands) {
    const [term, extra] = operands;
    if (extra !== undefined) throw new UsageError(`Unexpected argument "${extra}". Search for one term.`);
    const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(io.homeDirectory) });
    if (!registry.ok) {
      io.stderr.write(`${registry.message}\n`);
      return 1;
    }
    const query = term?.toLowerCase();
    const agents = query
      ? registry.agents.filter((entry) => `${entry.id} ${entry.name} ${entry.description ?? ""}`.toLowerCase().includes(query))
      : registry.agents;
    if (!options.json) {
      io.stdout.write(query && agents.length === 0 ? `No agent type matches "${term}".\n` : formatRegistryAgents(agents));
      return 0;
    }
    // The desktop app's PATH is the system's, so a command the login shell can see looks missing.
    const shellPath = await loginShellPath({ env: io.env });
    const pathValue = shellPath ?? io.env.PATH;
    const resolve = (command: string) => resolveCommand(command, { pathValue });
    const platform = platformTarget();
    const types = agents.map((entry) => {
      const launch = launchForEntry({ entry, platform, resolve });
      return {
        id: entry.id,
        name: entry.name,
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.icon ? { icon: entry.icon } : {}),
        ...(launch.ok ? { ready: true } : { ready: false, reason: launch.message }),
      };
    });
    io.stdout.write(`${JSON.stringify({ types }, null, 2)}\n`);
    return 0;
  },
});
