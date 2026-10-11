import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type DaemonSession = {
  relayUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export function daemonSessionPath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".config", "mukae", "daemon-session.json");
}

export function parseDaemonSession(value: unknown): DaemonSession | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.relayUrl !== "string" || typeof value.accessToken !== "string" || typeof value.refreshToken !== "string") return undefined;
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return undefined;
  try {
    return {
      relayUrl: new URL(value.relayUrl).origin,
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt,
    };
  } catch {
    return undefined;
  }
}

export async function readDaemonSession(homeDirectory = homedir()): Promise<DaemonSession | undefined> {
  try {
    const text = await readFile(daemonSessionPath(homeDirectory), "utf8");
    return parseDaemonSession(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export async function writeDaemonSession(session: DaemonSession, homeDirectory = homedir()): Promise<void> {
  const path = daemonSessionPath(homeDirectory);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(session, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
