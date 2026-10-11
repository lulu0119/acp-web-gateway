import { DEVICE_CODE_GRANT_TYPE } from "@better-auth/oauth-provider";
import { randomBytes } from "node:crypto";
import { machinesScope } from "@mukae/contract";
import type { MukaeAuth } from "./auth.js";

const daemonSoftwareId = "mukae-daemon";
const userSoftwarePrefix = "mukae-user-client:";
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
  const logoUri = record.logoUri === undefined ? undefined : typeof record.logoUri === "string" ? record.logoUri.trim() : "";
  const clientUri = record.clientUri === undefined ? undefined : typeof record.clientUri === "string" ? record.clientUri.trim() : "";
  const confidential = record.confidential;

  if (clientName.length === 0) errors.push("Give the client a name.");
  if (clientName.length > 64) errors.push("Keep the name under 64 characters.");
  if (/^mukae/i.test(clientName)) errors.push("Names starting with Mukae are reserved.");
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

export async function ensureDaemonClient(mukae: MukaeAuth): Promise<string> {
  const existing = await findClientId(mukae, daemonSoftwareId);
  if (existing) {
    await linkResource(mukae, existing);
    return existing;
  }
  const created = await withOwner(mukae, (headers) =>
    mukae.auth.api.adminCreateOAuthClient({
      headers,
      body: {
        software_id: daemonSoftwareId,
        client_name: "Mukae daemon",
        application_type: "native",
        redirect_uris: [`${mukae.publicUrl}/device/done`],
        grant_types: [DEVICE_CODE_GRANT_TYPE, "refresh_token"],
        token_endpoint_auth_method: "none",
        response_types: [],
        scope: machinesScope,
        skip_consent: false,
      },
    }),
  );
  if (!created.client_id) throw new Error("Mukae could not register the daemon client.");
  await linkResource(mukae, created.client_id);
  return created.client_id;
}

export async function registerClient(mukae: MukaeAuth, ownerUserId: string, input: ClientRegistration): Promise<RegisteredClient> {
  const owned = await userClientCount(mukae, ownerUserId);
  if (owned >= maxClientsPerUser) throw new Error(`Each account can register at most ${maxClientsPerUser} clients.`);
  const created = await withOwner(mukae, (headers) =>
    mukae.auth.api.adminCreateOAuthClient({
      headers,
      body: {
        software_id: `${userSoftwarePrefix}${ownerUserId}:${randomBytes(4).toString("hex")}`,
        client_name: input.clientName,
        client_uri: input.clientUri,
        logo_uri: input.logoUri,
        application_type: applicationTypeForRedirects(input.redirectUris),
        redirect_uris: input.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: input.confidential ? "client_secret_basic" : "none",
        response_types: ["code"],
        scope: machinesScope,
        skip_consent: false,
      },
    }),
  );
  if (!created.client_id) throw new Error("Mukae could not register the client.");
  await linkResource(mukae, created.client_id);
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

async function userClientCount(mukae: MukaeAuth, ownerUserId: string): Promise<number> {
  const context = await mukae.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({ model: "oauthClient", where: [] });
  return rows.filter((row) => row.softwareId?.startsWith(`${userSoftwarePrefix}${ownerUserId}:`)).length;
}

async function findClientId(mukae: MukaeAuth, softwareId: string): Promise<string | undefined> {
  const context = await mukae.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "softwareId", value: softwareId }],
  });
  return rows.find((row) => row.softwareId === softwareId)?.clientId;
}

async function withOwner<T>(mukae: MukaeAuth, run: (headers: Headers) => Promise<T>): Promise<T> {
  const context = await mukae.auth.$context;
  const owners = await context.adapter.findMany<{ id: string }>({
    model: "user",
    where: [{ field: "email", value: ownerEmail }],
  });
  const owner = owners[0] ?? (await context.internalAdapter.createUser({
    name: "Mukae",
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

const ownerEmail = "setup@mukae.invalid";

async function linkResource(mukae: MukaeAuth, clientId: string): Promise<void> {
  await withOwner(mukae, (headers) => mukae.auth.api.adminLinkClientResource({
    headers,
    params: { identifier: mukae.resource, client_id: clientId },
  }));
}
