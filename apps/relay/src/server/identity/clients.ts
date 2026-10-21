import { DEVICE_CODE_GRANT_TYPE } from "@better-auth/oauth-provider";
import { randomBytes } from "node:crypto";
import { devicesScope } from "@exterioragentprotocol/sdk";
import type { ExteriorAuth } from "./auth.js";

const daemonSoftwareId = "exterior-daemon";
const userSoftwarePrefix = "exterior-user-client:";
export const registeredSoftwarePrefix = userSoftwarePrefix;
/** A client a web app registered for itself (RFC 7591), once someone has approved it. */
const openSoftwarePrefix = "exterior-open-client:";
/** A client a web app registered for itself that nobody has approved yet. */
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
  const logoUri = optionalText(record.logoUri);
  const clientUri = optionalText(record.clientUri);
  const confidential = record.confidential;

  const nameProblem = validateClientName(clientName);
  if (nameProblem) errors.push(nameProblem);
  if (redirectUris.length === 0) errors.push("Add at least one redirect address.");
  if (redirectUris.length > 8) errors.push("Keep at most 8 redirect addresses.");
  for (const uri of redirectUris) {
    const problem = redirectProblem(uri);
    if (problem) errors.push(problem);
  }
  if (logoUri && redirectProblem(logoUri)) errors.push("The logo must be an https address, or http on this computer.");
  if (clientUri && !isHttpsUrl(clientUri)) errors.push("The homepage must be an https address.");
  if (typeof confidential !== "boolean") errors.push("Say whether the client keeps a secret.");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      clientName,
      redirectUris,
      logoUri,
      clientUri,
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

/**
 * Applies the relay's policy to a request bound for the OAuth provider, which otherwise handles it
 * as the standard says.
 */
export async function guardAuthRequest(exterior: ExteriorAuth, request: Request): Promise<Request | Response> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path.endsWith("/oauth2/authorize")) return askConsentForLoopback(request);
  if (request.method === "POST" && path.endsWith("/oauth2/register")) return await claimRegistration(exterior, request);
  return request;
}

/**
 * A redirect to this computer does not prove which program asks: any process here can listen on
 * that port. So the provider must ask the person every time, even for an app they approved before
 * (OAuth 2.1 §7.3). The authorization request gains `prompt=consent`; `prompt=none` is dropped,
 * since the provider would otherwise answer it from the remembered approval.
 */
function askConsentForLoopback(request: Request): Request {
  const url = new URL(request.url);
  if (!isLoopbackRedirect(url.searchParams.get("redirect_uri") ?? "")) return request;
  const prompts = new Set((url.searchParams.get("prompt") ?? "").split(" ").filter((prompt) => prompt.length > 0));
  if (prompts.has("consent") && !prompts.has("none")) return request;
  prompts.delete("none");
  prompts.add("consent");
  url.searchParams.set("prompt", [...prompts].join(" "));
  return new Request(url, request);
}

function isLoopbackRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && isLoopback(url.hostname);
  } catch {
    return false;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function optionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : undefined;
}

function isHttpsUrl(uri: string): boolean {
  try {
    return new URL(uri).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Marks a web app's own registration (RFC 7591) as one nobody has approved yet, so it can be pruned,
 * and so it cannot claim to be the daemon or a client an account registered. Those are told apart by
 * `software_id`, which the relay sets here in place of the app's.
 */
async function claimRegistration(exterior: ExteriorAuth, request: Request): Promise<Request | Response> {
  const body: unknown = await request.clone().json().catch(() => undefined);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return request;
  const metadata: Record<string, unknown> = { ...body };
  const name = typeof metadata.client_name === "string" ? metadata.client_name.trim() : "";
  if (/^exterior/i.test(name)) {
    return Response.json({ error: "invalid_client_metadata", error_description: "Names starting with Exterior are reserved." }, { status: 400 });
  }
  delete metadata.software_statement;
  delete metadata.software_version;
  metadata.software_id = `${pendingSoftwarePrefix}${randomBytes(8).toString("hex")}`;
  await prunePendingClients(exterior);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, { method: "POST", headers, body: JSON.stringify(metadata) });
}

function validateClientName(clientName: string): string | undefined {
  if (clientName.length === 0) return "Give the client a name.";
  if (clientName.length > 64) return "Keep the name under 64 characters.";
  if (/^exterior/i.test(clientName)) return "Names starting with Exterior are reserved.";
  return undefined;
}

/** Keeps a self-registered client once someone approves it, so the id the app cached stays valid. */
export async function approvePendingClient(exterior: ExteriorAuth, clientId: string): Promise<void> {
  const context = await exterior.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
  });
  const row = rows.find((item) => item.clientId === clientId);
  const softwareId = row?.softwareId;
  if (!softwareId?.startsWith(pendingSoftwarePrefix)) return;
  await context.adapter.update({
    model: "oauthClient",
    where: [{ field: "clientId", value: clientId }],
    update: { softwareId: `${openSoftwarePrefix}${softwareId.slice(pendingSoftwarePrefix.length)}` },
  });
}

/** Deletes self-registered clients nobody approved within an hour, since anyone can register one. */
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

export async function registerClient(exterior: ExteriorAuth, ownerUserId: string, input: ClientRegistration): Promise<RegisteredClient> {
  const owned = await userClientCount(exterior, ownerUserId);
  if (owned >= maxClientsPerUser) throw new Error(`Each account can register at most ${maxClientsPerUser} clients.`);
  const softwareId = `${userSoftwarePrefix}${ownerUserId}:${randomBytes(4).toString("hex")}`;
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
  return redirectUris.every(isLoopbackRedirect) ? "native" : "web";
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
