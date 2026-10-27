import { homedir } from "node:os";
import { resolve } from "node:path";
import { readGatewayConfig, usableWorkingDirectory, workingDirectoryPath, writeGatewayConfig } from "../../config.js";
import { defineCommand, UsageError } from "../command.js";

/** The one setting so far. A setting is named in its command, as git and npm name theirs. */
const workingDirectoryKey = "working-directory";

function settingOf(operands: readonly string[], values: number): string[] {
  const [key, ...rest] = operands;
  if (key === undefined) throw new UsageError(`Name a setting: ${workingDirectoryKey}.`);
  if (key !== workingDirectoryKey) throw new UsageError(`Unknown setting "${key}". Settings: ${workingDirectoryKey}.`);
  if (rest.length < values) throw new UsageError(`Give a value for ${key}.`);
  if (rest.length > values) throw new UsageError(`Unexpected argument "${rest[values]}".`);
  return rest;
}

const get = defineCommand({
  name: "get",
  description: "Print a setting",
  help: "Print the directory sessions work in. --json also says whether it was chosen or is the default.",
  options: [{ flags: "--json", description: "Print JSON" }],
  operands: ["<setting>"],
  examples: ["exterior config get working-directory", "exterior config get working-directory --json"],
  async action({ io }, options, operands) {
    settingOf(operands, 0);
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
  description: "Change a setting",
  help: "Choose the directory sessions work in. It is created if it does not exist, and a leading ~ means this person's home.",
  operands: ["<setting> <value>"],
  examples: ["exterior config set working-directory ~/Projects/mine", 'exterior config set working-directory "C:\\Projects\\mine"'],
  async action({ io }, _options, operands) {
    const [path = ""] = settingOf(operands, 1);
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    const directory = resolve(expandHome(path));
    const usable = await usableWorkingDirectory(directory, (line: string) => io.stderr.write(`${line}\n`));
    if (!usable) return 1;
    await writeGatewayConfig({ ...config, workingDirectory: usable }, io.homeDirectory);
    io.stdout.write(`Sessions work in ${usable}.\n`);
    return 0;
  },
});

const unset = defineCommand({
  name: "unset",
  description: "Go back to a setting's default",
  help: "Give up the directory chosen before, so sessions work in the device's own directory again.",
  operands: ["<setting>"],
  examples: ["exterior config unset working-directory"],
  async action({ io }, _options, operands) {
    settingOf(operands, 0);
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    const { workingDirectory: _chosen, ...rest } = config;
    await writeGatewayConfig(rest, io.homeDirectory);
    io.stdout.write(`Sessions work in ${workingDirectoryPath(io.homeDirectory)}.\n`);
    return 0;
  },
});

export const config = defineCommand({
  name: "config",
  description: "Read and change this device's settings",
  help: [
    `Read and change this device's settings. The one setting is ${workingDirectoryKey}: the directory an agent session works in when a web app names none of its own.`,
    "A running daemon picks a change up and opens later sessions there. Sessions already open keep the directory they started in.",
    "A directory is created when it is set, so a path that cannot be used is refused now rather than at the first session.",
  ].join("\n\n"),
  children: [get, set, unset],
});

/** A leading `~` is this person's home. */
function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return resolve(homedir(), path.slice(2));
  return path;
}
