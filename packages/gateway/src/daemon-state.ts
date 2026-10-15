import { isRecord } from "@exterior/contract";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { relayFileName } from "./sign-ins.js";

/**
 * What a daemon last said about itself, for `exterior status` and the desktop app.
 *
 * `waiting` is the delay before the next connection attempt. `stopped` carries the reason
 * when the daemon gave up, such as a sign-in the relay rejected.
 */
export type DaemonState = {
  relayUrl: string;
  pid: number;
  status: "connecting" | "connected" | "waiting" | "stopped";
  /** When the daemon entered this status, in milliseconds since the epoch. */
  since: number;
  agents: string[];
  message?: string;
};

const statuses = new Set(["connecting", "connected", "waiting", "stopped"]);

/**
 * Daemon state is runtime state, so it sits in the XDG state directory, home-relative on
 * every system like the working directory. One file per relay, as one daemon serves one relay.
 */
export function daemonStateDirectory(homeDirectory = homedir()): string {
  return join(homeDirectory, ".local", "state", "exterior", "daemons");
}

export async function writeDaemonState(state: DaemonState, homeDirectory = homedir()): Promise<void> {
  const directory = daemonStateDirectory(homeDirectory);
  const path = join(directory, relayFileName(state.relayUrl));
  await mkdir(directory, { recursive: true });
  // A reader never sees half a file.
  const draft = `${path}.${process.pid}.tmp`;
  await writeFile(draft, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(draft, path);
}

/**
 * Keeps one daemon's state file current. Writes happen in order, so a slow write never
 * lands after a newer one, and a failed write is dropped: the file is a report, not a record.
 */
export function daemonStateReporter(input: {
  relayUrl: string;
  agents: readonly string[];
  homeDirectory?: string;
  now?: () => number;
  /** Hears every state as it is written, such as `exterior daemon --json` printing it for the desktop app. */
  onState?: (state: DaemonState) => void;
}) {
  const now = input.now ?? Date.now;
  let state: DaemonState = { relayUrl: input.relayUrl, pid: process.pid, status: "connecting", since: now(), agents: [...input.agents] };
  let writes = Promise.resolve();
  const update = (change: Partial<DaemonState>) => {
    const since = change.status && change.status !== state.status ? now() : state.since;
    state = { ...state, ...change, since };
    const snapshot = state;
    input.onState?.(snapshot);
    writes = writes.then(() => writeDaemonState(snapshot, input.homeDirectory)).catch(() => undefined);
    return writes;
  };
  void update({});
  return {
    status: (status: Exclude<DaemonState["status"], "stopped">) => void update({ status }),
    agents: (agents: readonly string[]) => void update({ agents: [...agents] }),
    /** Records why the daemon stopped and resolves once that is on disk. */
    stopped: (message: string) => update({ status: "stopped", message }),
  };
}

/**
 * The state of the daemon for one relay, or undefined when none has run. A daemon that
 * died without saying so reads as stopped.
 */
export async function readDaemonState(
  relayUrl: string,
  homeDirectory = homedir(),
  isRunning: (pid: number) => boolean = processIsRunning,
): Promise<DaemonState | undefined> {
  let state: DaemonState | undefined;
  try {
    state = parseDaemonState(JSON.parse(await readFile(join(daemonStateDirectory(homeDirectory), relayFileName(relayUrl)), "utf8")));
  } catch {
    return undefined;
  }
  if (!state || state.status === "stopped" || isRunning(state.pid)) return state;
  return { ...state, status: "stopped", message: "The daemon exited without saying why." };
}

export function parseDaemonState(value: unknown): DaemonState | undefined {
  if (!isRecord(value)) return undefined;
  const { relayUrl, pid, status, since, agents, message } = value;
  if (typeof relayUrl !== "string" || typeof status !== "string" || !statuses.has(status)) return undefined;
  if (!Number.isInteger(pid) || typeof since !== "number") return undefined;
  if (!Array.isArray(agents) || agents.some((agent) => typeof agent !== "string")) return undefined;
  return {
    relayUrl,
    pid: pid as number,
    status: status as DaemonState["status"],
    since,
    agents: agents as string[],
    ...(typeof message === "string" ? { message } : {}),
  };
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to someone else.
    return isRecord(error) && error.code === "EPERM";
  }
}
