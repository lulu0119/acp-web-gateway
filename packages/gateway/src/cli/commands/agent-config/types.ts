import { acpRegistryCachePath, formatRegistryAgents, loadAcpRegistry } from "../../../acp-registry.js";
import { defineCommand } from "../../command.js";

export const types = defineCommand({
  name: "types",
  description: "Print the agent types in the ACP Registry",
  async action({ io }) {
    const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(io.homeDirectory) });
    if (!registry.ok) {
      io.stderr.write(`${registry.message}\n`);
      return 1;
    }
    io.stdout.write(formatRegistryAgents(registry.agents));
    return 0;
  },
});
