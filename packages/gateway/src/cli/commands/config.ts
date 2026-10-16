import { homedir } from "node:os";
import { resolve } from "node:path";
import { readGatewayConfig, usableWorkingDirectory, workingDirectoryPath, writeGatewayConfig } from "../../config.js";
import { defineCommand, stringOption, UsageError } from "../command.js";

const show = defineCommand({
  name: "show",
  description: "Print the directory sessions work in",
  help: "Print the directory sessions work in, and whether it was chosen or is the default. --json prints both as JSON.",
  options: [{ flags: "--json", description: "Print JSON" }],
  async action({ io }, options) {
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    const chosen = config.workingDirectory;
    const directory = chosen ?? workingDirectoryPath(io.homeDirectory);
    if (options.json) {
      io.stdout.write(`${JSON.stringify({ workingDirectory: directory, source: chosen ? "chosen" : "default" }, null, 2)}\n`);
      return 0;
    }
    io.stdout.write(`${directory}\n`);
    return 0;
  },
});

const set = defineCommand({
  name: "set",
  description: "Choose the directory sessions work in",
  help: "Choose the directory sessions work in. It is created if it does not exist. --default gives up a choice made before and uses the device's own directory again.",
  options: [
    { flags: "--working-directory <path>", description: "Directory to work in; a leading ~ means this person's home" },
    { flags: "--default", description: "Use the device's own directory again" },
  ],
  examples: [
    "exterior config set --working-directory ~/Projects/mine",
    'exterior config set --working-directory "C:\\Projects\\mine"',
    "exterior config set --default",
    "exterior config show --json",
  ],
  async action({ io }, options) {
    const path = stringOption(options, "working-directory");
    const useDefault = options.default === true;
    if (path !== undefined && useDefault) throw new UsageError("Pass --working-directory <path> or --default, not both.");
    if (path === undefined && !useDefault) throw new UsageError("Pass --working-directory <path> or --default.");
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    if (useDefault) {
      const { workingDirectory: _chosen, ...rest } = config;
      await writeGatewayConfig(rest, io.homeDirectory);
      io.stdout.write(`Sessions work in ${workingDirectoryPath(io.homeDirectory)}.\n`);
      return 0;
    }
    const directory = resolve(expandHome(path ?? ""));
    const usable = await usableWorkingDirectory(directory, (line: string) => io.stderr.write(`${line}\n`));
    if (!usable) return 1;
    await writeGatewayConfig({ ...config, workingDirectory: usable }, io.homeDirectory);
    io.stdout.write(`Sessions work in ${usable}.\n`);
    return 0;
  },
});

export const config = defineCommand({
  name: "config",
  description: "Set what this device's sessions work in",
  help: [
    "Set the directory an agent session works in by default, for a web app that names none of its own.",
    "A running daemon picks the change up and opens later sessions there. Sessions already open keep the directory they started in.",
    "A directory is created here, so a path that cannot be used is refused now rather than at the first session.",
  ].join("\n\n"),
  children: [show, set],
});

/** A leading `~` is this person's home. */
function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return resolve(homedir(), path.slice(2));
  return path;
}
