import { fetchPublicClients, beginDeviceAuthorization, pollDeviceAuthorization, refreshMukaeAccessToken, RefreshTokenRejectedError } from "@mukae/client";
import { readDaemonSession, writeDaemonSession, type DaemonSession } from "./daemon-session.js";

const refreshWindowMs = 60_000;

export class DaemonLoginRequiredError extends Error {
  constructor(message = "Run mukae login again.") {
    super(message);
    this.name = "DaemonLoginRequiredError";
  }
}

export async function signInDaemon(relayUrl: string, inform: (line: string) => void): Promise<void> {
  const clients = await fetchPublicClients(relayUrl);
  const pending = await beginDeviceAuthorization({ relayUrl, clientId: clients.daemonClientId });
  inform(`Visit ${pending.verificationUri}`);
  inform(`Enter ${pending.userCode}`);
  const tokens = await pollDeviceAuthorization(pending);
  if (!tokens.refreshToken) throw new Error("Mukae did not return a refresh token.");
  await writeDaemonSession({
    relayUrl: new URL(relayUrl).origin,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
}

export async function usableDaemonSession(input: {
  relayUrl: string;
  homeDirectory?: string;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}): Promise<DaemonSession> {
  const session = await readDaemonSession(input.homeDirectory);
  if (!session) throw new DaemonLoginRequiredError("Run mukae login first.");
  if (session.relayUrl !== new URL(input.relayUrl).origin) {
    throw new DaemonLoginRequiredError(`This machine is signed in to ${session.relayUrl}. Run mukae login --relay ${input.relayUrl} to switch.`);
  }
  if (!input.forceRefresh && session.expiresAt - Date.now() > refreshWindowMs) return session;
  const timeout = AbortSignal.timeout(10_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const clients = await fetchPublicClients(session.relayUrl, signal);
  const tokens = await refreshMukaeAccessToken({
    relayUrl: session.relayUrl,
    clientId: clients.daemonClientId,
    refreshToken: session.refreshToken,
    signal,
  }).catch((error: unknown) => {
    if (error instanceof RefreshTokenRejectedError) throw new DaemonLoginRequiredError();
    throw error;
  });
  if (!tokens.refreshToken) throw new DaemonLoginRequiredError();
  const next: DaemonSession = {
    relayUrl: session.relayUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  await writeDaemonSession(next, input.homeDirectory);
  return next;
}
