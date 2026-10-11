import { oauthDeviceAuthorization, oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer, jwt } from "better-auth/plugins";
import type Database from "better-sqlite3";

export type MukaeAuthConfig = {
  database: Database.Database;
  secret: string;
  publicUrl: string;
  githubClientId: string;
  githubClientSecret: string;
};

export async function openMukaeAuth(config: MukaeAuthConfig) {
  const built = buildMukaeAuth(config);
  await migrateAuth(built.options);
  return { ...built, auth: betterAuth(built.options) };
}

function buildMukaeAuth(config: MukaeAuthConfig) {
  const publicUrl = new URL(config.publicUrl).origin;
  const options = {
    appName: "Mukae",
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
        scopes: ["openid", "profile", "email", "offline_access", "machines"],
        resources: [{ identifier: publicUrl, name: "Mukae", allowedScopes: ["machines", "offline_access", "openid", "profile", "email"] }],
      }),
      oauthDeviceAuthorization({
        verificationUri: "/device",
      }),
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

export type MukaeAuth = Awaited<ReturnType<typeof openMukaeAuth>>;
