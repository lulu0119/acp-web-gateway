import { authorizeRequestPath, clientRegistryPath, grantsPath } from "@mukae/contract";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, Hono } from "hono";
import { readAccount, type Account } from "./account-session.js";
import type { RelayEnv } from "./app.js";
import type { MukaeAuth } from "./auth.js";
import {
  createPendingClient,
  parseClientRegistration,
  parsePendingClient,
  prunePendingClients,
  registerClient,
  type PendingClientRequest,
} from "./clients.js";
import type { ClientMeta, GrantedApp } from "./dashboard-data.js";

export function createRateLimit(input: { max: number; windowMs: number; now?: () => number }): (key: string) => boolean {
  const taken = new Map<string, number[]>();
  const now = input.now ?? Date.now;
  return (key) => {
    const at = now();
    const recent = (taken.get(key) ?? []).filter((stamp) => at - stamp < input.windowMs);
    if (recent.length >= input.max) {
      taken.set(key, recent);
      return false;
    }
    recent.push(at);
    taken.set(key, recent);
    return true;
  };
}

const approvalRequestLimit = createRateLimit({ max: 30, windowMs: 3_600_000 });

function requestIp(c: Context<RelayEnv>): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function mountClientRegistry(app: Hono<RelayEnv>, mukae: MukaeAuth): void {
  app.post(clientRegistryPath, async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    const parsed = parseClientRegistration(await c.req.json().catch(() => undefined));
    if (!parsed.ok) return c.json({ message: parsed.errors.join(" ") }, 400);
    try {
      const registered = await registerClient(mukae, account.userId, parsed.value);
      return c.json(registered, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mukae could not register the client.";
      return c.json({ message }, message.includes("at most") ? 429 : 502);
    }
  });

  app.post(authorizeRequestPath, async (c) => {
    if (!approvalRequestLimit(requestIp(c))) {
      return c.json({ message: "Too many approvals. Try again later." }, 429);
    }
    const parsed = parsePendingClient(await c.req.json().catch(() => undefined));
    if (!parsed.ok) return c.json({ message: parsed.errors.join(" ") }, 400);
    try {
      await prunePendingClients(mukae);
      const clientId = await createPendingClient(mukae, parsed.value);
      return c.json({ url: authorizeUrl(mukae, parsed.value, clientId) });
    } catch {
      return c.json({ message: "Mukae could not start the approval." }, 502);
    }
  });

  app.get(grantsPath, async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    return c.json({ apps: await listGrantedApps(mukae, account) });
  });

  app.post(`${grantsPath}/revoke`, async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    const body: unknown = await c.req.json().catch(() => undefined);
    const clientId = typeof body === "object" && body !== null && "clientId" in body && typeof body.clientId === "string" ? body.clientId : "";
    if (!clientId) return c.json({ message: "Choose an app to revoke." }, 400);
    await revokeGrant(mukae, account, clientId);
    return c.json({ revoked: true });
  });
}

function authorizeUrl(mukae: MukaeAuth, input: PendingClientRequest, clientId: string): string {
  const url = new URL("/api/auth/oauth2/authorize", mukae.publicUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", mukae.resource);
  return url.href;
}

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
  icon?: string | null;
  uri?: string | null;
};

export async function listGrantedApps(mukae: MukaeAuth, account: Account): Promise<GrantedApp[]> {
  const context = await mukae.auth.$context;
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
      logoUri: client?.icon ?? undefined,
      clientUri: client?.uri ?? undefined,
      scopes: Array.isArray(consent.scopes) ? consent.scopes : [],
      grantedAt: new Date(consent.createdAt).toISOString(),
    });
  }
  return apps;
}

export async function findClientMeta(mukae: MukaeAuth, clientId: string): Promise<ClientMeta | undefined> {
  const context = await mukae.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
  });
  const row = rows.find((item) => item.clientId === clientId);
  if (!row) return undefined;
  return {
    clientId,
    clientName: row.name ?? clientId,
    logoUri: row.icon ?? undefined,
    clientUri: row.uri ?? undefined,
  };
}

export async function hasRememberedGrant(mukae: MukaeAuth, account: Account, clientId: string, scopes: string[]): Promise<boolean> {
  const context = await mukae.auth.$context;
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

export async function revokeGrant(mukae: MukaeAuth, account: Account, clientId: string): Promise<void> {
  const context = await mukae.auth.$context;
  const where = [
    { field: "userId", value: account.userId },
    { field: "clientId", value: clientId },
  ];
  await context.adapter.deleteMany({ model: "oauthConsent", where });
  await context.adapter.deleteMany({ model: "oauthRefreshToken", where });
  await context.adapter.deleteMany({ model: "oauthAccessToken", where });
}
