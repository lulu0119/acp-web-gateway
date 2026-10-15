import { execFile } from "node:child_process";
import { delimiter } from "node:path";

const marker = "__EXTERIOR_PATH__";

/**
 * The `PATH` the person's login shell sets, merged in front of `current`, or undefined
 * when there is nothing to add.
 *
 * An app started at login, or from Finder, gets the system's minimal `PATH`, where `npx`
 * and agent commands are missing. The shell's own startup files are what put them on
 * `PATH`, so ask the shell, as VS Code does. Windows keeps `PATH` in the registry and
 * hands it to every process, so it is skipped there.
 */
export async function loginShellPath(input: {
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  run?: (shell: string, args: string[]) => Promise<string>;
}): Promise<string | undefined> {
  const platform = input.platform ?? process.platform;
  if (platform === "win32") return undefined;
  const shell = input.env.SHELL || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  let output: string;
  try {
    // Startup files may print anything, so the value sits between markers.
    output = await (input.run ?? runShell)(shell, ["-ilc", `printf '%s' "${marker}$PATH${marker}"`]);
  } catch {
    return undefined;
  }
  const found = output.split(marker)[1];
  if (!found) return undefined;
  const merged = mergePath(found, input.env.PATH ?? "");
  return merged === input.env.PATH ? undefined : merged;
}

/** `first`'s entries, then `second`'s entries that `first` lacks. */
export function mergePath(first: string, second: string): string {
  const entries: string[] = [];
  for (const entry of [...first.split(delimiter), ...second.split(delimiter)]) {
    if (entry && !entries.includes(entry)) entries.push(entry);
  }
  return entries.join(delimiter);
}

function runShell(shell: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // A shell whose startup files wait for input or hang must not hold up the daemon.
    execFile(shell, args, { timeout: 10_000, encoding: "utf8" }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}
