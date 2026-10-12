import Database from "better-sqlite3";
import { createRelayApp } from "./app.js";
import { createRegistry, type Registry } from "./connections/registry.js";
import { openDeviceStore } from "./devices/store.js";
import type { ReadAccess } from "./http.js";
import { openMukaeAuth, type MukaeAuth } from "./identity/auth.js";
import { ensureDaemonClient } from "./identity/clients.js";

export async function createTestApp(mukae: MukaeAuth, registry?: Registry, readAccess?: ReadAccess) {
  const devices = openDeviceStore(mukae.options.database);
  const live = registry ?? createRegistry({ seen: (device) => devices.record(device) });
  const daemonClientId = await ensureDaemonClient(mukae);
  const relay = createRelayApp({ mukae, registry: live, devices, clients: { daemonClientId }, githubConfigured: true, readAccess });
  return { ...relay, registry: live, devices, daemonClientId };
}

export async function openTestRelay(input: { publicUrl: string; registry?: Registry; readAccess?: ReadAccess }) {
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret: testSecret,
    publicUrl: input.publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  return { mukae, ...(await createTestApp(mukae, input.registry, input.readAccess)) };
}

export const testSecret = "test-secret-test-secret-test-secret";

/** Reads the account and client from `x-user-id` and `x-client-id`, standing in for a verified access token. */
export const headerAccess: ReadAccess = async (request) => {
  const userId = request.headers.get("x-user-id");
  if (!userId) return undefined;
  return { userId, clientId: request.headers.get("x-client-id") ?? "web-app" };
};

/** Signs a better-auth session token into the cookie the browser would send. */
export async function sessionCookie(token: string, secret = testSecret): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `better-auth.session_token=${token}.${encoded}`;
}

/** Opens a relay with one signed-in account. */
export async function openSignedInRelay(publicUrl = "http://127.0.0.1:8787") {
  const relay = await openTestRelay({ publicUrl });
  const context = await relay.mukae.auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: "Ada", email: "ada@example.test", emailVerified: true },
    { method: "test" },
  );
  const session = await context.internalAdapter.createSession(user.id);
  return { ...relay, userId: user.id, cookie: await sessionCookie(session.token) };
}
