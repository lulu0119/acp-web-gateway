import type { ExteriorAuth } from "./auth.js";
import type { Account } from "./session.js";
import type { GrantedApp } from "../../shared/account-web.js";
import { appIconPath, parseAppIcon, type AppIcon } from "./app-icons.js";
import { registeredSoftwarePrefix } from "./clients.js";

export type ClientMeta = {
  clientId: string;
  clientName: string;
  clientUri?: string;
  iconUrl?: string;
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
  icon?: string | null;
  redirectUris?: string[] | string | null;
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
      iconUrl: appIconPath(consent.clientId, client?.icon),
      origin: firstRedirectOrigin(client?.redirectUris),
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
    iconUrl: appIconPath(clientId, row.icon),
    registered: row.softwareId?.startsWith(registeredSoftwarePrefix) ?? false,
  };
}

/** Where the app's approvals return, which is the part of an app the relay can vouch for. */
function firstRedirectOrigin(redirectUris: string[] | string | null | undefined): string | undefined {
  try {
    const list: unknown = typeof redirectUris === "string" ? JSON.parse(redirectUris) : redirectUris;
    return Array.isArray(list) && typeof list[0] === "string" ? new URL(list[0]).origin : undefined;
  } catch {
    return undefined;
  }
}

export async function findClientIcon(exterior: ExteriorAuth, clientId: string): Promise<AppIcon | undefined> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
  });
  const icon = rows.find((row) => row.clientId === clientId)?.icon;
  return icon ? parseAppIcon(icon) : undefined;
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
