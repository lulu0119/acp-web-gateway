import Database from "better-sqlite3";
import { createAgentCatalog } from "./agents/catalog.js";
import { createRelayApp } from "./app.js";
import { createRegistry, type Registry } from "@exterioragentprotocol/sdk/relay";
import { openDeviceStore } from "./devices/store.js";
import type { ReadAccess } from "./http.js";
import type { DeviceSignedIn } from "./routes/sockets.js";
import { openExteriorAuth, type ExteriorAuth } from "./identity/auth.js";

export async function createTestApp(exterior: ExteriorAuth, registry?: Registry, readAccess?: ReadAccess, heartbeatMs?: number, deviceSignedIn?: DeviceSignedIn) {
  const devices = openDeviceStore(exterior.options.database);
  const live = registry ?? createRegistry({ seen: (device) => devices.record(device) });
  const relay = createRelayApp({
    exterior,
    registry: live,
    devices,
    githubConfigured: true,
    readAccess,
    // A token read from headers stands in for an approved client and a signed-in device.
    isGranted: readAccess ? async () => true : undefined,
    deviceSignedIn: deviceSignedIn ?? (readAccess ? async () => true : undefined),
    heartbeatMs,
    catalog: createAgentCatalog({ fetchText: async () => "{\"agents\":[]}" }),
  });
  return { ...relay, registry: live, devices };
}

export async function openTestRelay(input: { publicUrl: string; registry?: Registry; readAccess?: ReadAccess; heartbeatMs?: number; deviceSignedIn?: DeviceSignedIn }) {
  const exterior = await openExteriorAuth({
    database: new Database(":memory:"),
    secret: testSecret,
    publicUrl: input.publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  return { exterior, ...(await createTestApp(exterior, input.registry, input.readAccess, input.heartbeatMs, input.deviceSignedIn)) };
}

export const testSecret = "test-secret-test-secret-test-secret";

/**
 * Reads the account, client, scopes and device key from `x-user-id`, `x-client-id`, `x-scope` and `x-device-id`,
 * standing in for a verified access token. A token is a client's unless it says otherwise.
 */
export const headerAccess: ReadAccess = async (request) => {
  const userId = request.headers.get("x-user-id");
  if (!userId) return undefined;
  return {
    userId,
    clientId: request.headers.get("x-client-id") ?? "web-app",
    scopes: (request.headers.get("x-scope") ?? "eap:client").split(" "),
    deviceId: request.headers.get("x-device-id") ?? undefined,
  };
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
  const context = await relay.exterior.auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: "Ada", email: "ada@example.test", emailVerified: true },
    { method: "test" },
  );
  const session = await context.internalAdapter.createSession(user.id);
  return { ...relay, userId: user.id, cookie: await sessionCookie(session.token) };
}
