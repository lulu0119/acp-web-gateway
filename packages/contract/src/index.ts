import { devicesPath } from "@exterioragentprotocol/sdk";
import * as v from "valibot";

export const defaultRelayUrl = "http://127.0.0.1:8787";

export const publicClientsPath = "/api/clients";
export const clientRegistryPath = "/api/clients/register";
export const grantsPath = "/api/grants";

/** The ACP registry the daemon launches from and the relay reads agent icons from. */
export const acpRegistryUrl = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

export type PublicClients = {
  daemonClientId: string;
};

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

// The refresh token proves the sign-in the device id is bound to. Removing the device revokes it.
const DeviceRegistrationSchema = v.object({
  deviceId: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{8,128}$/)),
  hostname: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  refreshToken: v.pipe(v.string(), v.minLength(1), v.maxLength(1024)),
});

/** What a signed-in device tells the relay before its daemon connects. */
export type DeviceRegistration = v.InferOutput<typeof DeviceRegistrationSchema>;

/**
 * The relay did not register the device. 401: the access token expired. 403: the refresh token is not a live
 * sign-in of this account, such as one revoked by removing the device. 409: another account holds the device id.
 */
export class DeviceRegistrationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "DeviceRegistrationError";
  }
}

/** The registry icon address to show for an agent, or undefined when it is not a usable https address. */
export function registryIconUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function isEnvName(value: string): boolean {
  return envNamePattern.test(value);
}

export function parseDeviceRegistration(value: unknown): DeviceRegistration | undefined {
  const parsed = v.safeParse(DeviceRegistrationSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The relay's own clients. The daemon signs in as `daemonClientId`. */
export async function fetchPublicClients(relayUrl: string, signal?: AbortSignal): Promise<PublicClients> {
  const origin = new URL(relayUrl).origin;
  const response = await fetch(new URL(publicClientsPath, origin), { signal }).catch((error: unknown) => {
    if (signal?.aborted) throw error;
    throw new Error(`Exterior did not answer at ${origin}.`, { cause: error });
  });
  if (!response.ok) throw new Error(`Exterior did not answer at ${origin}.`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!isRecord(body) || typeof body.daemonClientId !== "string") {
    throw new Error("Exterior did not list its clients.");
  }
  return { daemonClientId: body.daemonClientId };
}

/** Tells the relay which device a daemon sign-in belongs to. A daemon connects only as a registered device. */
export async function registerDevice(relayUrl: string, accessToken: string, device: DeviceRegistration, signal?: AbortSignal): Promise<void> {
  const response = await fetch(new URL(devicesPath, new URL(relayUrl).origin), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(device),
    signal,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message = isRecord(body) && typeof body.message === "string" ? body.message : `Exterior did not record this device (HTTP ${response.status}).`;
    throw new DeviceRegistrationError(response.status, message);
  }
}
