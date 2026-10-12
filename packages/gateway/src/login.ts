import { fetchPublicClients, beginDeviceAuthorization, pollDeviceAuthorization, refreshMukaeAccessToken, RefreshTokenRejectedError } from "@mukae/client";
import { readSignIn, writeSignIn, type SignIn } from "./sign-ins.js";

const refreshWindowMs = 60_000;

export class DaemonLoginRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaemonLoginRequiredError";
  }
}

export function loginAgain(relayUrl: string): string {
  return `Run mukae login --relay ${relayUrl} again.`;
}

export async function signInDaemon(input: {
  relayUrl: string;
  inform: (line: string) => void;
  homeDirectory?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const clients = await fetchPublicClients(input.relayUrl, input.signal);
  const pending = await beginDeviceAuthorization({ relayUrl: input.relayUrl, clientId: clients.daemonClientId });
  if (pending.verificationUriComplete) {
    input.inform(`Open ${pending.verificationUriComplete} and approve the code ${pending.userCode}.`);
  } else {
    input.inform(`Open ${pending.verificationUri} and enter the code ${pending.userCode}.`);
  }
  input.inform(`The code expires in ${Math.max(1, Math.round((pending.expiresAt - Date.now()) / 60_000))} minutes. Waiting for approval…`);
  const tokens = await pollDeviceAuthorization(pending, input.signal);
  if (!tokens.refreshToken) throw new Error("Mukae did not return a refresh token.");
  await writeSignIn({
    relayUrl: new URL(input.relayUrl).origin,
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
  if (!signIn) throw new DaemonLoginRequiredError(`This machine is not signed in to ${relayUrl}. Run mukae login --relay ${relayUrl}.`);
  if (!input.forceRefresh && signIn.expiresAt - Date.now() > refreshWindowMs) return signIn;
  const timeout = AbortSignal.timeout(10_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const clients = await fetchPublicClients(relayUrl, signal);
  const tokens = await refreshMukaeAccessToken({
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
