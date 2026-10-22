import { exteriorDeviceClient } from "@exterior/contract";
import { beginDeviceAuthorization, pollDeviceAuthorization, refreshAccessToken, RefreshTokenRejectedError } from "@exterioragentprotocol/sdk/device";
import { deviceKeyFor, readDeviceKey } from "./device-keys.js";
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

/**
 * Signs this device in with a code the person approves, as Exterior's device software. The tokens are bound to
 * the device's key for this relay, which it keeps across sign-outs, so signing in again is the same device.
 */
export async function signInDaemon(input: {
  relayUrl: string;
  inform: (line: string) => void;
  /** Hears the code to approve, for a caller that shows it itself instead of reading `inform`. */
  onCode?: (code: { verificationUri: string; userCode: string; expiresAt: number }) => void;
  homeDirectory?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const relayUrl = new URL(input.relayUrl).origin;
  const key = await deviceKeyFor(relayUrl, input.homeDirectory);
  const pending = await beginDeviceAuthorization({ relayUrl, clientId: exteriorDeviceClient.client_id });
  input.onCode?.({ verificationUri: pending.verificationUriComplete ?? pending.verificationUri, userCode: pending.userCode, expiresAt: pending.expiresAt });
  if (pending.verificationUriComplete) {
    input.inform(`Open ${pending.verificationUriComplete} and approve the code ${pending.userCode}.`);
  } else {
    input.inform(`Open ${pending.verificationUri} and enter the code ${pending.userCode}.`);
  }
  input.inform(`The code expires in ${Math.max(1, Math.round((pending.expiresAt - Date.now()) / 60_000))} minutes. Waiting for approval…`);
  const tokens = await pollDeviceAuthorization(pending, key, input.signal);
  if (!tokens.refreshToken) throw new Error("Exterior did not return a refresh token.");
  await writeSignIn({
    relayUrl,
    clientId: pending.clientId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  }, input.homeDirectory);
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
  const deviceKey = await readDeviceKey(relayUrl, input.homeDirectory);
  if (!deviceKey) throw new DaemonLoginRequiredError(loginAgain(relayUrl));
  const timeout = AbortSignal.timeout(10_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const tokens = await refreshAccessToken({
    relayUrl,
    clientId: signIn.clientId,
    refreshToken: signIn.refreshToken,
    deviceKey,
    signal,
  }).catch((error: unknown) => {
    if (error instanceof RefreshTokenRejectedError) throw new DaemonLoginRequiredError(loginAgain(relayUrl));
    throw error;
  });
  if (!tokens.refreshToken) throw new DaemonLoginRequiredError(loginAgain(relayUrl));
  const next: SignIn = {
    relayUrl,
    clientId: signIn.clientId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  await writeSignIn(next, input.homeDirectory);
  return next;
}
