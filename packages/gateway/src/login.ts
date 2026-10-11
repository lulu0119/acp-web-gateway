import { fetchPublicClients, beginDeviceAuthorization, pollDeviceAuthorization, refreshMukaeAccessToken } from "@mukae/client";
import { readDaemonSession, writeDaemonSession, type DaemonSession } from "./daemon-session.js";

const refreshWindowMs = 60_000;

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

export async function usableDaemonSession(homeDirectory?: string): Promise<DaemonSession> {
  const session = await readDaemonSession(homeDirectory);
  if (!session) throw new Error("Run mukae login first.");
  if (session.expiresAt - Date.now() > refreshWindowMs) return session;
  const clients = await fetchPublicClients(session.relayUrl);
  const tokens = await refreshMukaeAccessToken({
    relayUrl: session.relayUrl,
    clientId: clients.daemonClientId,
    refreshToken: session.refreshToken,
  });
  if (!tokens.refreshToken) throw new Error("Run mukae login again.");
  const next: DaemonSession = {
    relayUrl: session.relayUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  await writeDaemonSession(next, homeDirectory);
  return next;
}
