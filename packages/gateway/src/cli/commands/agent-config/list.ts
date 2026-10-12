import { formatAgentConfigList } from "../../../agents.js";
import { readGatewayConfig } from "../../../config.js";
import { defineCommand } from "../../command.js";

export const list = defineCommand({
  name: "list",
  description: "Print the agent configuration names",
  async action({ io }) {
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    io.stdout.write(formatAgentConfigList(config.agents));
    return 0;
  },
});
