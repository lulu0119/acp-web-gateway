# The daemon launches agents from the ACP Registry

The launch commands for Claude, Codex, Gemini, and OpenCode were a table in the gateway. That table duplicated the ACP Registry and left every other agent out. The daemon now reads `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`. An `npx` or `uvx` entry is started with that tool. A binary entry runs only when its command is already on `PATH`. The registry also publishes archives. Mukae does not download them: the install is the command the person already put on the machine. An agent that is not listed is a custom command.

## Considered Options

- **Download binary archives from the registry.** Rejected. A missing command stays uninstalled. The person installs it, or passes `--command`.
- **Keep the four-command table.** Rejected. A new registry agent would need another edit here.
