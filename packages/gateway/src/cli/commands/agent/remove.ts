import { readGatewayConfig, writeGatewayConfig } from "../../../config.js";
import { defineCommand, UsageError } from "../../command.js";

export const remove = defineCommand({
  name: "remove",
  description: "Remove agents",
  help: "Remove agents by name. A running daemon stops offering them; sessions already open keep their agent. Nothing is removed when one of the names is not an agent.",
  operands: ["<name...>"],
  examples: ["exterior agent remove work", "exterior agent remove work personal"],
  async action({ io }, _options, names) {
    if (names.length === 0) throw new UsageError("Name the agents to remove, from `exterior agent list`.");
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    const missing = names.filter((name) => !config.agents.some((agent) => agent.name === name));
    if (missing.length > 0) {
      io.stderr.write(`No agent is named ${missing.map((name) => `"${name}"`).join(", ")}.\n`);
      return 1;
    }
    await writeGatewayConfig({ ...config, agents: config.agents.filter((agent) => !names.includes(agent.name)) }, io.homeDirectory);
    for (const name of new Set(names)) io.stdout.write(`Removed agent "${name}".\n`);
    return 0;
  },
});
