import { DEVICE_CODE_GRANT_TYPE } from "@better-auth/oauth-provider";
import { randomBytes } from "node:crypto";
import { devicesScope } from "@exterior/contract";
import type { ExteriorAuth } from "./auth.js";

const daemonSoftwareId = "exterior-daemon";
const userSoftwarePrefix = "exterior-user-client:";
export const registeredSoftwarePrefix = userSoftwarePrefix;
const openSoftwarePrefix = "exterior-open-client:";
const pendingSoftwarePrefix = "exterior-pending:";
export const maxClientsPerUser = 10;
const pendingTtlMs = 3_600_000;

export type ClientRegistration = {
  clientName: string;
  redirectUris: string[];
  logoUri?: string;
  clientUri?: string;
  confidential: boolean;
};

export type RegisteredClient = {
  clientId: string;
  clientSecret?: string;
};

export type RegistrationParse =
  | { ok: true; value: ClientRegistration }
  | { ok: false; errors: string[] };

export function parseClientRegistration(body: unknown): RegistrationParse {
  const errors: string[] = [];
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const clientName = typeof record.clientName === "string" ? record.clientName.trim() : "";
  const redirectUris = Array.isArray(record.redirectUris) ? record.redirectUris.filter((uri): uri is string => typeof uri === "string") : [];
  const logoUri = record.logoUri === undefined ? undefined : typeof record.logoUri === "string" ? record.logoUri.trim() : "";
  const clientUri = record.clientUri === undefined ? undefined : typeof record.clientUri === "string" ? record.clientUri.trim() : "";
  const confidential = record.confidential;

  const nameProblem = validateClientName(clientName);
  if (nameProblem) errors.push(nameProblem);
  if (redirectUris.length === 0) errors.push("Add at least one redirect address.");
  if (redirectUris.length > 8) errors.push("Keep at most 8 redirect addresses.");
  for (const uri of redirectUris) {
    const problem = redirectProblem(uri);
    if (problem) errors.push(problem);
  }
  if (logoUri !== undefined && logoUri.length > 0 && !isHttpsUrl(logoUri)) errors.push("The logo must be an https address.");
  if (clientUri !== undefined && clientUri.length > 0 && !isHttpsUrl(clientUri)) errors.push("The homepage must be an https address.");
  if (typeof confidential !== "boolean") errors.push("Say whether the client keeps a secret.");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      clientName,
      redirectUris,
      logoUri: logoUri && logoUri.length > 0 ? logoUri : undefined,
      clientUri: clientUri && clientUri.length > 0 ? clientUri : undefined,
      confidential: confidential as boolean,
    },
  };
}

function redirectProblem(uri: string): string | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `Redirect ${uri} is not an address.`;
  }
  if (url.hash) return `Redirect ${uri} must not carry a fragment.`;
  if (url.username || url.password) return `Redirect ${uri} must not carry credentials.`;
  if (url.protocol === "https:") return undefined;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return undefined;
  return `Redirect ${uri} must be https, or http on this computer.`;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isHttpsUrl(uri: string): boolean {
  try {
    return new URL(uri).protocol === "https:";
  } catch {
    return false;
  }
}

export type PendingClientRequest = {
  clientName: string;
  logoUri?: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
};

export type PendingParse = { ok: true; value: PendingClientRequest } | { ok: false; errors: string[] };

const grantableScopes = ["devices", "offline_access"];

export function parsePendingClient(body: unknown): PendingParse {
  const errors: string[] = [];
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const clientName = typeof record.clientName === "string" ? record.clientName.trim() : "";
  const logoUri = record.logoUri === undefined ? undefined : typeof record.logoUri === "string" ? record.logoUri.trim() : "";
  const redirectUri = typeof record.redirectUri === "string" ? record.redirectUri.trim() : "";
  const scopes = Array.isArray(record.scopes) ? record.scopes.filter((scope): scope is string => typeof scope === "string") : [];
  const state = typeof record.state === "string" ? record.state : "";
  const codeChallenge = typeof record.codeChallenge === "string" ? record.codeChallenge : "";
  const nameProblem = validateClientName(clientName);
  if (nameProblem) errors.push(nameProblem);
  if (state.length === 0 || state.length > 128) errors.push("The approval needs a state.");
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) errors.push("The approval needs a PKCE challenge.");
  const redirect = redirectProblem(redirectUri);
  if (redirect) errors.push(redirect);
  if (logoUri !== undefined && logoUri.length > 0 && !isHttpsUrl(logoUri)) errors.push("The logo must be an https address.");
  if (scopes.length === 0) errors.push("Ask for at least one scope.");
  for (const scope of scopes) {
    if (!grantableScopes.includes(scope)) errors.push(`Exterior does not grant the ${scope} scope.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      clientName,
      logoUri: logoUri && logoUri.length > 0 ? logoUri : undefined,
      redirectUri,
      scopes: [...new Set(scopes)],
      state,
      codeChallenge,
    },
  };
}

function validateClientName(clientName: string): string | undefined {
  if (clientName.length === 0) return "Give the client a name.";
  if (clientName.length > 64) return "Keep the name under 64 characters.";
  if (/^exterior/i.test(clientName)) return "Names starting with Exterior are reserved.";
  return undefined;
}

export async function createPendingClient(exterior: ExteriorAuth, input: PendingClientRequest): Promise<string> {
  const created = await withOwner(exterior, (headers) =>
    exterior.auth.api.adminCreateOAuthClient({
      headers,
      body: {
        software_id: `${pendingSoftwarePrefix}${randomBytes(8).toString("hex")}`,
        client_name: input.clientName,
        logo_uri: input.logoUri,
        application_type: applicationTypeForRedirects([input.redirectUri]),
        redirect_uris: [input.redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        response_types: ["code"],
        scope: input.scopes.join(" "),
        skip_consent: false,
      },
    }),
  );
  if (!created.client_id) throw new Error("Exterior could not start the approval.");
  await linkResource(exterior, created.client_id);
  return created.client_id;
}

export async function approvePendingClient(exterior: ExteriorAuth, clientId: string): Promise<boolean> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
  });
  const row = rows.find((item) => item.clientId === clientId);
  const softwareId = row?.softwareId;
  if (!softwareId?.startsWith(pendingSoftwarePrefix)) return false;
  await context.adapter.update({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
    update: { softwareId: `${openSoftwarePrefix}${softwareId.slice(pendingSoftwarePrefix.length)}` },
  });
  return true;
}

export async function prunePendingClients(exterior: ExteriorAuth, olderThanMs = pendingTtlMs, now: number = Date.now()): Promise<number> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredClient & { id?: string; createdAt?: Date | string }>({
    model: "oauthClient",
    where: [],
  });
  let pruned = 0;
  for (const row of rows) {
    if (!row.softwareId?.startsWith(pendingSoftwarePrefix)) continue;
    const createdAt = row.createdAt ? new Date(row.createdAt).getTime() : Number.NaN;
    if (!Number.isFinite(createdAt) || now - createdAt < olderThanMs) continue;
    const id = row.id ?? row.clientId;
    if (!id) continue;
    await context.adapter.delete({ model: "oauthClient", where: [{ field: row.id ? "id" : "clientId", value: id }] });
    pruned += 1;
  }
  return pruned;
}

export async function ensureDaemonClient(exterior: ExteriorAuth): Promise<string> {
  const existing = await findClientId(exterior, daemonSoftwareId);
  if (existing) {
    await linkResource(exterior, existing);
    return existing;
  }
  const created = await withOwner(exterior, (headers) =>
    exterior.auth.api.adminCreateOAuthClient({
      headers,
      body: {
        software_id: daemonSoftwareId,
        client_name: "Exterior daemon",
        application_type: "native",
        redirect_uris: [`${exterior.publicUrl}/device/done`],
        grant_types: [DEVICE_CODE_GRANT_TYPE, "refresh_token"],
        token_endpoint_auth_method: "none",
        response_types: [],
        scope: devicesScope,
        skip_consent: false,
      },
    }),
  );
  if (!created.client_id) throw new Error("Exterior could not register the daemon client.");
  await linkResource(exterior, created.client_id);
  return created.client_id;
}

export async function registerClient(
  exterior: ExteriorAuth,
  ownerUserId: string | undefined,
  input: ClientRegistration,
): Promise<RegisteredClient> {
  if (input.confidential && !ownerUserId) throw new Error("Sign in again.");
  if (ownerUserId) {
    const owned = await userClientCount(exterior, ownerUserId);
    if (owned >= maxClientsPerUser) throw new Error(`Each account can register at most ${maxClientsPerUser} clients.`);
  }
  const softwareId = ownerUserId
    ? `${userSoftwarePrefix}${ownerUserId}:${randomBytes(4).toString("hex")}`
    : `${openSoftwarePrefix}${randomBytes(8).toString("hex")}`;
  const created = await withOwner(exterior, (headers) =>
    exterior.auth.api.adminCreateOAuthClient({
      headers,
      body: {
        software_id: softwareId,
        client_name: input.clientName,
        client_uri: input.clientUri,
        logo_uri: input.logoUri,
        application_type: applicationTypeForRedirects(input.redirectUris),
        redirect_uris: input.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: input.confidential ? "client_secret_basic" : "none",
        response_types: ["code"],
        scope: devicesScope,
        skip_consent: false,
      },
    }),
  );
  if (!created.client_id) throw new Error("Exterior could not register the client.");
  await linkResource(exterior, created.client_id);
  return { clientId: created.client_id, clientSecret: input.confidential ? created.client_secret ?? undefined : undefined };
}

function applicationTypeForRedirects(redirectUris: string[]): "web" | "native" {
  const loopbackOnly = redirectUris.every((uri) => {
    try {
      const url = new URL(uri);
      return url.protocol === "http:" && isLoopback(url.hostname);
    } catch {
      return false;
    }
  });
  return loopbackOnly ? "native" : "web";
}

type StoredClient = { clientId?: string; softwareId?: string | null };

async function userClientCount(exterior: ExteriorAuth, ownerUserId: string): Promise<number> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({ model: "oauthClient", where: [] });
  return rows.filter((row) => row.softwareId?.startsWith(`${userSoftwarePrefix}${ownerUserId}:`)).length;
}

async function findClientId(exterior: ExteriorAuth, softwareId: string): Promise<string | undefined> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "softwareId", value: softwareId }],
  });
  return rows.find((row) => row.softwareId === softwareId)?.clientId;
}

async function withOwner<T>(exterior: ExteriorAuth, run: (headers: Headers) => Promise<T>): Promise<T> {
  const context = await exterior.auth.$context;
  const owners = await context.adapter.findMany<{ id: string }>({
    model: "user",
    where: [{ field: "email", value: ownerEmail }],
  });
  const owner = owners[0] ?? (await context.internalAdapter.createUser({
    name: "Exterior",
    email: ownerEmail,
    emailVerified: true,
  }, { method: "test" }));
  const session = await context.internalAdapter.createSession(owner.id);
  try {
    return await run(new Headers({ authorization: `Bearer ${session.token}` }));
  } finally {
    await context.internalAdapter.deleteSession(session.token);
  }
}

const ownerEmail = "setup@exterior.invalid";

async function linkResource(exterior: ExteriorAuth, clientId: string): Promise<void> {
  await withOwner(exterior, (headers) => exterior.auth.api.adminLinkClientResource({
    headers,
    params: { identifier: exterior.resource, client_id: clientId },
  }));
}

export async function requestClientApproval(exterior: ExteriorAuth, input: PendingClientRequest): Promise<string> {
  await prunePendingClients(exterior);
  const clientId = await createPendingClient(exterior, input);
  const url = new URL("/api/auth/oauth2/authorize", exterior.publicUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", exterior.resource);
  return url.href;
}
