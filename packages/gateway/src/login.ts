import { randomBytes } from "node:crypto";
import {
  beginDeviceAuthorization,
  fetchPublicClients,
  pollDeviceAuthorization,
  refreshExteriorAccessToken,
  RefreshTokenRejectedError,
  registerDevice,
} from "@exterior/client";
import { readSignIn, writeSignIn, type SignIn } from "./sign-ins.js";

const refreshWindowMs = 60_000;

export class DaemonLoginRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaemonLoginRequiredError";
  }
}

export function loginAgain(relayUrl: string): string {
  return `Run exterior login --relay ${relayUrl} again.`;
}

export function newDeviceId(): string {
  return randomBytes(16).toString("base64url");
}

export async function signInDaemon(input: {
  relayUrl: string;
  hostname: string;
  inform: (line: string) => void;
  /** Hears the code to approve, for a caller that shows it itself instead of reading `inform`. */
  onCode?: (code: { verificationUri: string; userCode: string; expiresAt: number }) => void;
  homeDirectory?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const clients = await fetchPublicClients(input.relayUrl, input.signal);
  const pending = await beginDeviceAuthorization({ relayUrl: input.relayUrl, clientId: clients.daemonClientId });
  input.onCode?.({ verificationUri: pending.verificationUriComplete ?? pending.verificationUri, userCode: pending.userCode, expiresAt: pending.expiresAt });
  if (pending.verificationUriComplete) {
    input.inform(`Open ${pending.verificationUriComplete} and approve the code ${pending.userCode}.`);
  } else {
    input.inform(`Open ${pending.verificationUri} and enter the code ${pending.userCode}.`);
  }
  input.inform(`The code expires in ${Math.max(1, Math.round((pending.expiresAt - Date.now()) / 60_000))} minutes. Waiting for approval…`);
  const tokens = await pollDeviceAuthorization(pending, input.signal);
  if (!tokens.refreshToken) throw new Error("Exterior did not return a refresh token.");
  const relayUrl = new URL(input.relayUrl).origin;
  const previous = await readSignIn(relayUrl, input.homeDirectory);
  const deviceId = previous?.deviceId ?? newDeviceId();
  await writeSignIn({
    relayUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    deviceId,
  }, input.homeDirectory);
  // Listing the device right away is a convenience: the daemon announces it again whenever it connects.
  await registerDevice(relayUrl, tokens.accessToken, { deviceId, hostname: input.hostname.slice(0, 256) }, input.signal).catch(() => {
    input.inform("The relay did not record this device yet. It appears once exterior daemon connects.");
  });
}

/** The device id of this device's sign-in to a relay, creating one for a sign-in written before ids existed. */
export async function signedInDeviceId(relayUrl: string, homeDirectory?: string): Promise<string | undefined> {
  const signIn = await readSignIn(relayUrl, homeDirectory);
  if (!signIn) return undefined;
  if (signIn.deviceId) return signIn.deviceId;
  const deviceId = newDeviceId();
  await writeSignIn({ ...signIn, deviceId }, homeDirectory);
  return deviceId;
}

export async function usableSignIn(input: {
  relayUrl: string;
  homeDirectory?: string;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}): Promise<SignIn> {
  const relayUrl = new URL(input.relayUrl).origin;
  const signIn = await readSignIn(relayUrl, input.homeDirectory);
  if (!signIn) throw new DaemonLoginRequiredError(`This device is not signed in to ${relayUrl}. Run exterior login --relay ${relayUrl}.`);
  if (!input.forceRefresh && signIn.expiresAt - Date.now() > refreshWindowMs) return signIn;
  const timeout = AbortSignal.timeout(10_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const clients = await fetchPublicClients(relayUrl, signal);
  const tokens = await refreshExteriorAccessToken({
    relayUrl,
    clientId: clients.daemonClientId,
    refreshToken: signIn.refreshToken,
    signal,
  }).catch((error: unknown) => {
    if (error instanceof RefreshTokenRejectedError) throw new DaemonLoginRequiredError(loginAgain(relayUrl));
    throw error;
  });
  if (!tokens.refreshToken) throw new DaemonLoginRequiredError(loginAgain(relayUrl));
  const next: SignIn = {
    relayUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    deviceId: signIn.deviceId,
  };
  await writeSignIn(next, input.homeDirectory);
  return next;
}
