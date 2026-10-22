import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, extname, join, resolve } from "node:path";

/**
 * A command name resolved to the one file this machine would run.
 *
 * `image` is a file the operating system starts itself. `batch` is a
 * `.cmd`/`.bat` script, which only cmd.exe can run.
 */
export type Executable = { kind: "image" | "batch"; path: string };

export type ResolveOptions = {
  /** Defaults to this machine. Tests pass `true` to resolve Windows names against a fixture directory. */
  windows?: boolean;
  pathValue?: string;
  pathExt?: string;
};

const windowsExtensions = [".com", ".exe", ".bat", ".cmd"];

/**
 * Resolves a command name to the file to start, or undefined when nothing on
 * this machine answers to it.
 *
 * This is the only lookup: the existence check and the launch use the same
 * file, so cmd.exe never gets to search PATH on its own.
 */
export function resolveCommand(command: string, options?: ResolveOptions): Executable | undefined {
  const windows = options?.windows ?? process.platform === "win32";
  if (!fileName(command)) return undefined;
  const extensions = windows ? extensionsFor(command, options?.pathExt) : [""];
  if (isPath(command)) return firstExecutable([resolve(command)], extensions, windows);
  const directories = (options?.pathValue ?? process.env.PATH ?? "").split(delimiter).filter((directory) => directory.length > 0);
  return firstExecutable(
    directories.map((directory) => join(directory, command)),
    extensions,
    windows,
  );
}

/**
 * Starts an agent so that a stop reaches its whole tree.
 *
 * A batch script is only the parent of the agent it runs, and `npx` and `uvx`
 * start the agent as their own child, so stopping the direct child is not
 * enough on any platform.
 */
export function startProcess(input: {
  executable: Executable;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  workingDirectory: string;
}): { child: ChildProcess; stop: () => void } {
  // The agent writes its own diagnostics to the daemon's standard error.
  const options = { cwd: input.workingDirectory, env: input.env, stdio: ["pipe", "pipe", "inherit"] as ["pipe", "pipe", "inherit"], windowsHide: true };
  const child =
    input.executable.kind === "batch"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/v:off", "/s", "/c", `"${batchCommandLine(input.executable.path, input.args)}"`], {
          ...options,
          windowsVerbatimArguments: true,
        })
      : // A POSIX process group lets one signal reach the agent's own children.
        spawn(input.executable.path, [...input.args], { ...options, detached: process.platform !== "win32" });
  return { child, stop: () => stopProcess(child) };
}

const stopGraceMs = 2_000;

/**
 * Closes the agent's input, then ends the tree if it is still running.
 *
 * An ACP agent exits when its input ends. That also holds when this process
 * dies before the timer runs, because the pipe closes with it.
 */
function stopProcess(child: ChildProcess): void {
  child.stdin?.end();
  if (child.exitCode !== null || child.signalCode !== null) return;
  const timer = setTimeout(() => endTree(child), stopGraceMs);
  child.once("exit", () => clearTimeout(timer));
}

function endTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // Windows has no signal for a process tree.
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }).on("error", () => undefined);
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function fileName(command: string): string {
  const base = command.replaceAll("\\", "/").split("/").pop() ?? "";
  return base === "." || base === ".." ? "" : base;
}

function isPath(command: string): boolean {
  return command.includes("/") || command.includes("\\");
}

/**
 * The extensions to try after a Windows name, in PATHEXT order.
 *
 * A name with no extension is never itself a candidate: npm installs an
 * extensionless shell script next to every `.cmd`, and Windows cannot start it.
 */
function extensionsFor(command: string, pathExt: string | undefined): string[] {
  if (extname(command).length > 0) return windowsExtensions.includes(extname(command).toLowerCase()) ? [""] : [];
  const listed = (pathExt ?? process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";");
  return listed.filter((extension) => windowsExtensions.includes(extension.toLowerCase()));
}

function firstExecutable(stems: readonly string[], extensions: readonly string[], windows: boolean): Executable | undefined {
  for (const stem of stems) {
    for (const extension of extensions) {
      const found = executable(`${stem}${extension}`, windows);
      if (found) return found;
    }
  }
  return undefined;
}

/** The kind comes from the extension found: CreateProcess answers EINVAL for a `.cmd`. */
function executable(filePath: string, windows: boolean): Executable | undefined {
  try {
    if (!statSync(filePath).isFile()) return undefined;
    if (windows) {
      const extension = extname(filePath).toLowerCase();
      return { kind: extension === ".cmd" || extension === ".bat" ? "batch" : "image", path: filePath };
    }
    accessSync(filePath, constants.X_OK);
    return { kind: "image", path: filePath };
  } catch {
    return undefined;
  }
}

/**
 * The command line cmd.exe runs.
 *
 * Node's own quoting is not enough for a script: cmd.exe reads `&` in an
 * unquoted argument as a second command and expands `%NAME%` even inside
 * quotes. Arguments cmd.exe cannot carry literally are refused, not escaped.
 */
function batchCommandLine(file: string, args: readonly string[]): string {
  return [`"${file}"`, ...args.map(batchArgument)].join(" ");
}

function batchArgument(argument: string): string {
  for (const character of argument) {
    if (unsafeInBatch.has(character)) throw new Error(`The argument "${argument}" cannot be passed to a batch command.`);
  }
  return /[\s,;=()]/.test(argument) || argument.length === 0 ? `"${argument}"` : argument;
}

const unsafeInBatch = new Set([...'"%!^&|<>', "\r", "\n", "\0"]);
