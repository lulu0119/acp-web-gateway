import { isRecord } from "@exterior/contract";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { configDirectory, relayFileName } from "./sign-ins.js";

const idPattern = /^[A-Za-z0-9_-]{8,128}$/;

// Apart from the sign-in, so signing out and in again keeps the same device on the relay.
function deviceIdPath(relayUrl: string, homeDirectory: string): string {
  return join(configDirectory(homeDirectory), "devices", relayFileName(relayUrl));
}

/** The id this device goes by on one relay, if it has one. */
export async function readDeviceId(relayUrl: string, homeDirectory = homedir()): Promise<string | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(deviceIdPath(relayUrl, homeDirectory), "utf8"));
    return isRecord(value) && typeof value.deviceId === "string" && idPattern.test(value.deviceId) ? value.deviceId : undefined;
  } catch {
    return undefined;
  }
}

export async function writeDeviceId(relayUrl: string, deviceId: string, homeDirectory = homedir()): Promise<void> {
  const origin = new URL(relayUrl).origin;
  const path = deviceIdPath(origin, homeDirectory);
  await mkdir(join(configDirectory(homeDirectory), "devices"), { recursive: true, mode: 0o700 });
  const draft = `${path}.${process.pid}.tmp`;
  await writeFile(draft, `${JSON.stringify({ relayUrl: origin, deviceId }, null, 2)}\n`, "utf8");
  await rename(draft, path);
}
