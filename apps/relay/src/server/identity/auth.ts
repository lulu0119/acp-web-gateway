import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { oauthDeviceAuthorization, oauthProvider, type ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer, jwt } from "better-auth/plugins";
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

export type ExteriorAuthConfig = {
  database: Database.Database;
  secret: string;
  publicUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  /** How Client ID Metadata Documents are fetched. Tests pass their own; the default refuses private addresses. */
  fetchClientMetadataResource?: ClientMetadataResourceFetch;
};

export async function openExteriorAuth(config: ExteriorAuthConfig) {
  const built = buildExteriorAuth(config);
  await migrateAuth(built.options);
  return { ...built, auth: betterAuth(built.options) };
}

function buildExteriorAuth(config: ExteriorAuthConfig) {
  const publicUrl = new URL(config.publicUrl).origin;
  const options = {
    appName: "Exterior",
    baseURL: publicUrl,
    secret: config.secret,
    database: config.database,
    socialProviders: {
      github: {
        clientId: config.githubClientId,
        clientSecret: config.githubClientSecret,
      },
    },
    disabledPaths: ["/token"],
    plugins: [
      bearer(),
      jwt(),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/consent",
        scopes: ["openid", "profile", "email", "offline_access", "devices"],
        resources: [{ identifier: publicUrl, name: "Exterior", allowedScopes: ["devices", "offline_access", "openid", "profile", "email"] }],
        // A web app registers itself (RFC 7591) or names itself by a metadata document's URL (CIMD).
        // Either way it can ask for what a web app is granted, against this relay.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultScopes: ["devices", "offline_access"],
        clientRegistrationDefaultResources: [publicUrl],
        // Named here so the relay can find a refresh token's row by the token itself.
        storeTokens: { hash: hashToken },
      }),
      oauthDeviceAuthorization({
        verificationUri: "/device",
      }),
      cimd({ fetchClientMetadataResource: config.fetchClientMetadataResource ?? fetchClientMetadataResource }),
    ],
  };
  return {
    options,
    publicUrl,
    resource: publicUrl,
    issuer: `${publicUrl}/api/auth`,
    jwksUrl: `${publicUrl}/api/auth/jwks`,
  };
}

async function migrateAuth(options: Parameters<typeof getMigrations>[0]): Promise<void> {
  const plan = await getMigrations(options);
  await plan.runMigrations();
}

export type ExteriorAuth = Awaited<ReturnType<typeof openExteriorAuth>>;

/** How a token is stored: SHA-256, base64url without padding. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
