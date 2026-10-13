import type { ExteriorAuth } from "./auth.js";
import type { Account } from "./session.js";
import type { GrantedApp } from "../../shared/account-web.js";
import { registeredSoftwarePrefix } from "./clients.js";

export type ClientMeta = {
  clientId: string;
  clientName: string;
  clientUri?: string;
  /** Whether an account registered the client; otherwise its name is whatever the app sent. */
  registered: boolean;
};

type StoredConsent = {
  id: string;
  clientId: string;
  userId?: string | null;
  scopes?: string[] | string | null;
  createdAt: Date | string;
};

type StoredClient = {
  clientId?: string;
  name?: string | null;
  uri?: string | null;
  softwareId?: string | null;
};

export async function listGrantedApps(exterior: ExteriorAuth, account: Account): Promise<GrantedApp[]> {
  const context = await exterior.auth.$context;
  const consents = await context.adapter.findMany<StoredConsent>({
    model: "oauthConsent",
    where: [{ field: "userId", value: account.userId }],
  });
  const apps: GrantedApp[] = [];
  for (const consent of consents) {
    if (consent.userId !== account.userId) continue;
    const clients = await context.adapter.findMany<StoredClient>({
      model: "oauthClient",
      where: [{ field: "clientId", value: consent.clientId }],
    });
    const client = clients.find((row) => row.clientId === consent.clientId);
    apps.push({
      clientId: consent.clientId,
      clientName: client?.name ?? consent.clientId,
      clientUri: client?.uri ?? undefined,
      scopes: Array.isArray(consent.scopes) ? consent.scopes : [],
      grantedAt: new Date(consent.createdAt).toISOString(),
    });
  }
  return apps;
}

export async function findClientMeta(exterior: ExteriorAuth, clientId: string): Promise<ClientMeta | undefined> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
  });
  const row = rows.find((item) => item.clientId === clientId);
  if (!row) return undefined;
  return {
    clientId,
    clientName: row.name ?? clientId,
    clientUri: row.uri ?? undefined,
    registered: row.softwareId?.startsWith(registeredSoftwarePrefix) ?? false,
  };
}

export async function hasRememberedGrant(exterior: ExteriorAuth, account: Account, clientId: string, scopes: string[]): Promise<boolean> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredConsent>({
    model: "oauthConsent",
    where: [
      { field: "userId", value: account.userId },
      { field: "clientId", value: clientId },
    ],
  });
  return rows.some((row) => {
    if (row.userId !== account.userId || row.clientId !== clientId) return false;
    const granted = Array.isArray(row.scopes) ? row.scopes : [];
    return scopes.every((scope) => granted.includes(scope));
  });
}

export async function revokeGrant(exterior: ExteriorAuth, account: Account, clientId: string): Promise<void> {
  const context = await exterior.auth.$context;
  const where = [
    { field: "userId", value: account.userId },
    { field: "clientId", value: clientId },
  ];
  await context.adapter.deleteMany({ model: "oauthConsent", where });
  await context.adapter.deleteMany({ model: "oauthRefreshToken", where });
  await context.adapter.deleteMany({ model: "oauthAccessToken", where });
}
