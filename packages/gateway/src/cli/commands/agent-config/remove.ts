import { readGatewayConfig, writeGatewayConfig } from "../../../config.js";
import { defineCommand, stringOption, UsageError } from "../../command.js";

export const remove = defineCommand({
  name: "remove",
  description: "Remove an agent configuration",
  help: "Remove an agent configuration by name. A running daemon stops offering it; sessions already open keep their agent.",
  options: [{ flags: "--name <name>", description: "Configuration name from `exterior agent-config list`" }],
  examples: ["exterior agent-config remove --name work"],
  async action({ io }, options) {
    const name = stringOption(options, "name");
    if (!name) throw new UsageError("Pass --name <name>.");
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    const agents = config.agents.filter((agent) => agent.name !== name);
    if (agents.length === config.agents.length) {
      io.stderr.write(`No agent configuration is named "${name}".\n`);
      return 1;
    }
    await writeGatewayConfig({ ...config, agents }, io.homeDirectory);
    io.stdout.write(`Removed agent configuration "${name}".\n`);
    return 0;
  },
});
