import { randomBytes } from "node:crypto";
import { clientScope, deviceScope } from "@exterioragentprotocol/sdk";
import type { ExteriorAuth } from "./auth.js";

const userSoftwarePrefix = "exterior-user-client:";
export const maxClientsPerUser = 10;

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
 * as the standard says. One OAuth client holds one EAP role: a client signs in with the authorization
 * code flow for `eap:client`, and a device with the device authorization grant for `eap:device`.
 */
export async function guardAuthRequest(exterior: ExteriorAuth, request: Request): Promise<Request | Response> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path.endsWith("/oauth2/authorize")) {
    const scopes = scopeList(new URL(request.url).searchParams.get("scope"));
    if (scopes.includes(deviceScope)) return invalidScope("A device signs in with a device code.");
    return askConsentForLoopback(request);
  }
  if (request.method === "POST" && path.endsWith("/device/code")) {
    const params = new URLSearchParams(await request.clone().text());
    const scopes = scopeList(params.get("scope"));
    if (!scopes.includes(deviceScope) || scopes.includes(clientScope)) return invalidScope(`A device signs in for ${deviceScope}.`);
    // A client that can also sign in through a browser, such as one named by a metadata document, is not a device.
    if (await signsInThroughBrowser(exterior, params.get("client_id") ?? "")) return oauthError("unauthorized_client", "This client is not a device.");
    return request;
  }
  return request;
}

async function signsInThroughBrowser(exterior: ExteriorAuth, clientId: string): Promise<boolean> {
  const context = await exterior.auth.$context;
  const row = await context.adapter.findOne<{ clientId: string; grantTypes?: string[] | string | null }>({ model: "oauthClient", where: [{ field: "clientId", value: clientId }] });
  const grantTypes = row?.grantTypes;
  return Array.isArray(grantTypes) ? grantTypes.includes("authorization_code") : (grantTypes ?? "").includes("authorization_code");
}

function scopeList(scope: string | null | undefined): string[] {
  return (scope ?? "").split(" ").filter((item) => item.length > 0);
}

function invalidScope(description: string): Response {
  return oauthError("invalid_scope", description);
}

// Built with `new Response`: the Node server swaps in its own Response class, and the static `json` would make an
// instance of the original, which fails the caller's `instanceof Response`.
function oauthError(error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), { status: 400, headers: { "content-type": "application/json" } });
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

export function isLoopbackRedirect(uri: string): boolean {
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

function validateClientName(clientName: string): string | undefined {
  if (clientName.length === 0) return "Give the client a name.";
  if (clientName.length > 64) return "Keep the name under 64 characters.";
  if (/^exterior/i.test(clientName)) return "Names starting with Exterior are reserved.";
  return undefined;
}

const registrations = new WeakMap<ExteriorAuth, Promise<unknown>>();

/** A public client the account already registered with the same details is returned again, not duplicated. */
export async function registerClient(exterior: ExteriorAuth, ownerUserId: string, input: ClientRegistration): Promise<RegisteredClient> {
  const previous = registrations.get(exterior) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => createClient(exterior, ownerUserId, input));
  registrations.set(exterior, pending);
  try {
    return await pending;
  } finally {
    if (registrations.get(exterior) === pending) registrations.delete(exterior);
  }
}

async function createClient(exterior: ExteriorAuth, ownerUserId: string, input: ClientRegistration): Promise<RegisteredClient> {
  if (!input.confidential) {
    const context = await exterior.auth.$context;
    const rows = await context.adapter.findMany<StoredClient & { name?: string; redirectUris?: string[]; tokenEndpointAuthMethod?: string; uri?: string | null; icon?: string | null }>({ model: "oauthClient", where: [] });
    const existing = rows.find((row) => row.softwareId?.startsWith(`${userSoftwarePrefix}${ownerUserId}:`)
      && row.name === input.clientName && row.tokenEndpointAuthMethod === "none"
      && (row.uri ?? undefined) === input.clientUri && (row.icon ?? undefined) === input.logoUri
      && JSON.stringify(row.redirectUris) === JSON.stringify(input.redirectUris));
    if (existing?.clientId) return { clientId: existing.clientId };
  }
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
        scope: `${clientScope} offline_access`,
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
