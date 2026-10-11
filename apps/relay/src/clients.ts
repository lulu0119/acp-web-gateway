import { DEVICE_CODE_GRANT_TYPE } from "@better-auth/oauth-provider";
import type { PublicClients } from "@mukae/contract";
import { machinesScope } from "@mukae/contract";
import type { MukaeAuth } from "./auth.js";

const exampleSoftwareId = "mukae-example";
const daemonSoftwareId = "mukae-daemon";

type StoredClient = { clientId?: string; softwareId?: string | null };

export async function ensurePublicClients(
  mukae: MukaeAuth,
  input: { redirectUri: string },
): Promise<PublicClients> {
  const exampleClientId = await ensureClient(mukae, {
    softwareId: exampleSoftwareId,
    clientName: "Example",
    applicationType: applicationTypeForRedirect(input.redirectUri),
    redirectUris: [input.redirectUri],
    grantTypes: ["authorization_code", "refresh_token"],
  });
  const daemonClientId = await ensureClient(mukae, {
    softwareId: daemonSoftwareId,
    clientName: "Mukae daemon",
    applicationType: "native",
    redirectUris: [`${mukae.publicUrl}/device/done`],
    grantTypes: [DEVICE_CODE_GRANT_TYPE, "refresh_token"],
  });
  await linkResource(mukae, exampleClientId);
  await linkResource(mukae, daemonClientId);
  return { exampleClientId, daemonClientId };
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

function applicationTypeForRedirect(redirectUri: string): "web" | "native" {
  const url = new URL(redirectUri);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol === "http:" && loopback) return "native";
  return "web";
}

async function ensureClient(
  mukae: MukaeAuth,
  input: {
    softwareId: string;
    clientName: string;
    applicationType: "web" | "native";
    redirectUris: string[];
    grantTypes: string[];
  },
): Promise<string> {
  const existing = await findClientId(mukae, input.softwareId);
  if (existing) return existing;
  const created = await withOwner(mukae, (headers) => mukae.auth.api.adminCreateOAuthClient({
    headers,
    body: {
      software_id: input.softwareId,
      client_name: input.clientName,
      application_type: input.applicationType,
      redirect_uris: input.redirectUris,
      grant_types: input.grantTypes,
      token_endpoint_auth_method: "none",
      response_types: input.grantTypes.includes("authorization_code") ? ["code"] : [],
      scope: machinesScope,
      skip_consent: false,
    },
  }));
  if (!created.client_id) throw new Error(`Mukae could not register the ${input.clientName} client.`);
  return created.client_id;
}

async function findClientId(mukae: MukaeAuth, softwareId: string): Promise<string | undefined> {
  const context = await mukae.auth.$context;
  const rows = await context.adapter.findMany<StoredClient>({
    model: "oauthClient",
    where: [{ field: "softwareId", value: softwareId }],
  });
  return rows.find((row) => row.softwareId === softwareId)?.clientId;
}

async function linkResource(mukae: MukaeAuth, clientId: string): Promise<void> {
  await withOwner(mukae, (headers) => mukae.auth.api.adminLinkClientResource({
    headers,
    params: { identifier: mukae.resource, client_id: clientId },
  }));
}
