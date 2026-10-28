import { defineCommand } from "../../command.js";
import { search } from "./search.js";

export const registry = defineCommand({
  name: "registry",
  description: "Look up agent types in the ACP Registry",
  help: "Look up agent types in the ACP Registry. An agent type's id is what `exterior agent add <type>` takes.",
  children: [search],
});
