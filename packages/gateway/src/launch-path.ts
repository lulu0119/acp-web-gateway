import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export function commandOnPath(command: string, pathValue: string): string {
  if (command.includes("/") || command.includes("\\")) return command;
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return command;
}

export function firstMissingCommand(commands: readonly string[], pathValue: string): string | undefined {
  for (const command of commands) {
    if (command.includes("/") || command.includes("\\")) continue;
    if (commandOnPath(command, pathValue) === command) return command;
  }
  return undefined;
}

export function parseLoginPath(output: string): string {
  const line = output
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.includes(delimiter) && item.split(delimiter).some((directory) => directory.startsWith("/")))
    .at(-1);
  return line ?? "";
}

let cachedLoginPath: string | undefined;

export function readLoginPath(): string {
  if (cachedLoginPath !== undefined) return cachedLoginPath;
  try {
    const output = execFileSync("/bin/zsh", ["-lic", "builtin print -r -- $PATH"], {
      encoding: "utf8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    cachedLoginPath = parseLoginPath(output);
  } catch {
    cachedLoginPath = "";
  }
  return cachedLoginPath;
}
