import type { ExteriorAuth } from "./auth.js";
import type { Account } from "./session.js";
import type { GrantedApp } from "../../shared/account-web.js";
import { registeredSoftwarePrefix } from "./clients.js";

export type ClientMeta = {
  clientId: string;
  clientName: string;
  clientUri?: string;
  logoUri?: string;
  /** Whether an account registered the client; otherwise its name is whatever the app sent. */
  registered: boolean;
  /** Whether the client is a Client ID Metadata Document: its id is the https address it was read from. */
  metadataDocument: boolean;
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
  clientDiscoveryId?: string | null;
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
      logoUri: displayableLogo(client?.icon),
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
    logoUri: displayableLogo(row.icon),
    registered: row.softwareId?.startsWith(registeredSoftwarePrefix) ?? false,
    metadataDocument: Boolean(row.clientDiscoveryId),
  };
}

/**
 * A logo the pages may show: the browser loads it from the app, so only an https address, one on
 * this computer, or an inline image.
 */
function displayableLogo(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  if (/^data:image\/[a-z+.-]+[;,]/i.test(uri)) return uri;
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return url.href;
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    return url.protocol === "http:" && loopback ? url.href : undefined;
  } catch {
    return undefined;
  }
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
