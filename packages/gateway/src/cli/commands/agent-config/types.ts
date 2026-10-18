import { acpRegistryCachePath, formatRegistryAgents, launchForEntry, loadAcpRegistry, platformTarget } from "../../../acp-registry.js";
import { resolveCommand } from "../../../launch.js";
import { loginShellPath } from "../../../shell-path.js";
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
    // The desktop app's PATH is the system's, so a command the login shell can see looks missing.
    const shellPath = await loginShellPath({ env: io.env });
    const pathValue = shellPath ?? io.env.PATH;
    const resolve = (command: string) => resolveCommand(command, { pathValue });
    const platform = platformTarget();
    const types = registry.agents.map((entry) => {
      // An npx or uvx entry can be fetched at launch. Ready means the agent itself is already on this machine.
      const installed = launchForEntry({ entry: { ...entry, npx: undefined, uvx: undefined }, platform, resolve }).ok;
      const launch = installed ? undefined : launchForEntry({ entry, platform, resolve });
      const reason = installed ? undefined : launch?.ok ? "Not installed." : launch?.message;
      return {
        id: entry.id,
        name: entry.name,
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.icon ? { icon: entry.icon } : {}),
        ...(reason ? { ready: false, reason } : { ready: true }),
      };
    });
    io.stdout.write(`${JSON.stringify({ types }, null, 2)}\n`);
    return 0;
  },
});
