import { defineCommand } from "../../command.js";
import { add } from "./add.js";
import { list } from "./list.js";
import { remove } from "./remove.js";

export const agent = defineCommand({
  name: "agent",
  description: "Manage the agents this device offers",
  help: "Manage the agents this device offers. Each agent has a name, an agent type from the ACP Registry or a command of its own, and its own environment.",
  children: [list, add, remove],
});
