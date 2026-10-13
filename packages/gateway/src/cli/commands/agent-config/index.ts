import { defineCommand } from "../../command.js";
import { create } from "./create.js";
import { list } from "./list.js";
import { types } from "./types.js";

export const agentConfig = defineCommand({
  name: "agent-config",
  description: "Manage the agents this device offers",
  help: "Manage the agents this device offers. Each configuration has a name, an agent type from the ACP Registry or a custom command, and its own environment.",
  children: [list, types, create],
});
