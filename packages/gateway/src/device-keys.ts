import { isRecord } from "@exterior/contract";
import { exportDeviceKey, generateDeviceKey, importDeviceKey, type DeviceKey } from "@exterioragentprotocol/sdk/device";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { configDirectory, relayFileName } from "./sign-ins.js";

// Apart from the sign-in, so signing out and in again keeps the same device on the relay.
function deviceKeyPath(relayUrl: string, homeDirectory: string): string {
  return join(configDirectory(homeDirectory), "devices", relayFileName(relayUrl));
}

/** The key this device holds for one relay, if it has one. Its thumbprint is the device id there. */
export async function readDeviceKey(relayUrl: string, homeDirectory = homedir()): Promise<DeviceKey | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(deviceKeyPath(relayUrl, homeDirectory), "utf8"));
    return isRecord(value) && isRecord(value.key) ? await importDeviceKey(value.key) : undefined;
  } catch {
    return undefined;
  }
}

/** The device's key for one relay, made and kept privately the first time it signs in there. */
export async function deviceKeyFor(relayUrl: string, homeDirectory = homedir()): Promise<DeviceKey> {
  const kept = await readDeviceKey(relayUrl, homeDirectory);
  if (kept) return kept;
  const key = await generateDeviceKey();
  const origin = new URL(relayUrl).origin;
  const path = deviceKeyPath(origin, homeDirectory);
  await mkdir(join(configDirectory(homeDirectory), "devices"), { recursive: true, mode: 0o700 });
  const draft = `${path}.${process.pid}.tmp`;
  await writeFile(draft, `${JSON.stringify({ relayUrl: origin, key: await exportDeviceKey(key) }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(draft, 0o600);
  await rename(draft, path);
  return key;
}
