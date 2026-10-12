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

export async function signInDaemon(relayUrl: string, inform: (line: string) => void): Promise<void> {
  const clients = await fetchPublicClients(relayUrl);
  const pending = await beginDeviceAuthorization({ relayUrl, clientId: clients.daemonClientId });
  inform(`Visit ${pending.verificationUri}`);
  inform(`Enter ${pending.userCode}`);
  const tokens = await pollDeviceAuthorization(pending);
  if (!tokens.refreshToken) throw new Error("Mukae did not return a refresh token.");
  await writeSignIn({
    relayUrl: new URL(relayUrl).origin,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
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
