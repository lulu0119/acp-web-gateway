import { cac } from "cac";
import { readFileSync } from "node:fs";
import { defineCommand, formatHelp, registerCommandTree, resolveCommandPath, UsageError, type CliIo } from "./command.js";
import { commandTree } from "./commands/index.js";

export type { CliIo } from "./command.js";

const root = defineCommand({
  name: "exterior",
  description: "Connect this device's ACP agents to an Exterior account",
  help: "Connect this device's ACP agents to an Exterior account. Sign in to a relay, add an agent configuration, then keep the daemon running.",
  children: commandTree,
  examples: [
    "exterior login --relay relay.example.com",
    "exterior agent-config create --agent-type opencode",
    "exterior daemon",
  ],
});

/** Runs one CLI invocation. `args` excludes the node and script paths. Exit 2 means the command was mistyped. */
export async function executeCli(args: readonly string[], io: CliIo, runtime: { signal?: AbortSignal } = {}): Promise<number> {
  const words = args.filter((arg) => !arg.startsWith("-"));
  if (args.includes("--version") || args.includes("-v")) {
    io.stdout.write(`${packageVersion()}\n`);
    return 0;
  }
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    io.stdout.write(formatHelp({ bin: "exterior", root, path: resolveCommandPath(commandTree, words) }));
    return 0;
  }
  const cli = cac("exterior");
  let pending: Promise<number> | undefined;
  registerCommandTree(cli, commandTree, { io, signal: runtime.signal }, (result) => {
    pending = result;
  });
  try {
    cli.parse(["node", "exterior", ...args], { run: false });
    if (!cli.matchedCommand) throw new UsageError(`Unknown command "${words[0] ?? args[0]}".`);
    cli.runMatchedCommand();
    return await (pending ?? Promise.resolve(0));
  } catch (error) {
    if (!(error instanceof UsageError) && !(error instanceof Error && error.name === "CACError")) throw error;
    const path = resolveCommandPath(commandTree, words).map((node) => node.name);
    io.stderr.write(`${error.message}\nRun \`${["exterior", ...path].join(" ")} --help\` for usage.\n`);
    return 2;
  }
}

declare const __EXTERIOR_VERSION__: string | undefined;

// The build writes the version in, because a single executable has no package.json beside it.
function packageVersion(): string {
  if (typeof __EXTERIOR_VERSION__ === "string") return __EXTERIOR_VERSION__;
  const text = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
  return (JSON.parse(text) as { version: string }).version;
}
