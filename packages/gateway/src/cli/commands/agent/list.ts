import { formatAgentList } from "../../../agents.js";
import { readGatewayConfig } from "../../../config.js";
import { defineCommand } from "../../command.js";

export const list = defineCommand({
  name: "list",
  description: "Print the agents this device offers",
  help: "Print the agents this device offers, by name and type. --json prints each one with the names of its environment variables; values stay out, because they can be keys.",
  options: [{ flags: "--json", description: "Print JSON" }],
  async action({ io }, options) {
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    if (!options.json) {
      io.stdout.write(formatAgentList(config.agents));
      return 0;
    }
    const agents = config.agents.map((agent) => ({
      name: agent.name,
      agentType: agent.agentType,
      envNames: Object.keys(agent.env),
      ...(agent.command ? { command: [agent.command, ...(agent.args ?? [])] } : {}),
    }));
    io.stdout.write(`${JSON.stringify({ agents }, null, 2)}\n`);
    return 0;
  },
});
