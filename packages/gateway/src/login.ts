import { randomBytes } from "node:crypto";
import { DeviceRegistrationError, fetchPublicClients, registerDevice } from "@exterior/contract";
import { beginDeviceAuthorization, pollDeviceAuthorization, refreshAccessToken, RefreshTokenRejectedError } from "@exterioragentprotocol/sdk/device";
import { readDeviceId, writeDeviceId } from "./device-ids.js";
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
  const deviceId = await deviceIdFor(relayUrl, input.homeDirectory);
  await writeSignIn({
    relayUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  }, input.homeDirectory);
  const registration = { hostname: input.hostname.slice(0, 256), refreshToken: tokens.refreshToken };
  // Listing the device right away is a convenience: the daemon registers it again before it connects.
  await registerDevice(relayUrl, tokens.accessToken, { deviceId, ...registration }, input.signal)
    .catch(async (error: unknown) => {
      if (!(error instanceof DeviceRegistrationError) || error.status !== 409) throw error;
      // Another account signed this device in to the relay before; this account gets a device of its own.
      const fresh = newDeviceId();
      await writeDeviceId(relayUrl, fresh, input.homeDirectory);
      await registerDevice(relayUrl, tokens.accessToken, { deviceId: fresh, ...registration }, input.signal);
    })
    .catch(() => {
      input.inform("The relay did not record this device yet. exterior daemon records it before it connects.");
    });
}

/** Registers this device with its current sign-in. A daemon connects only as a registered device. */
export async function registerSignedInDevice(input: {
  relayUrl: string;
  deviceId: string;
  hostname: string;
  homeDirectory?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const signIn = await usableSignIn({ relayUrl: input.relayUrl, homeDirectory: input.homeDirectory, signal: input.signal });
  await registerDevice(signIn.relayUrl, signIn.accessToken, {
    deviceId: input.deviceId,
    hostname: input.hostname.slice(0, 256),
    refreshToken: signIn.refreshToken,
  }, input.signal);
}

/** The id this device goes by on a relay. It outlives signing out, so signing in again keeps the same device. */
export async function deviceIdFor(relayUrl: string, homeDirectory?: string): Promise<string> {
  const kept = await readDeviceId(relayUrl, homeDirectory);
  if (kept) return kept;
  const deviceId = newDeviceId();
  await writeDeviceId(relayUrl, deviceId, homeDirectory);
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
  const tokens = await refreshAccessToken({
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
  };
  await writeSignIn(next, input.homeDirectory);
  return next;
}
