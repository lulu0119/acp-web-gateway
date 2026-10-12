import Database from "better-sqlite3";
import { createRelayApp } from "./app.js";
import { createRegistry, type Registry } from "./connections/registry.js";
import type { ReadUserId } from "./http.js";
import { openMukaeAuth, type MukaeAuth } from "./identity/auth.js";
import { ensureDaemonClient } from "./identity/clients.js";

export async function createTestApp(mukae: MukaeAuth, registry: Registry = createRegistry(), readUserId?: ReadUserId) {
  return createRelayApp({
    mukae,
    registry,
    clients: { daemonClientId: await ensureDaemonClient(mukae) },
    githubConfigured: true,
    readUserId,
  });
}

export async function openTestRelay(input: { publicUrl: string; registry: Registry; readUserId: ReadUserId }) {
  const mukae = await openMukaeAuth({
    database: new Database(":memory:"),
    secret: "test-secret-test-secret-test-secret",
    publicUrl: input.publicUrl,
    githubClientId: "github-client",
    githubClientSecret: "github-secret",
  });
  return createTestApp(mukae, input.registry, input.readUserId);
}
