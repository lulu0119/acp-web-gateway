import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { openMukaeAuth } from "./server/identity/auth.js";
import { createRelayApp } from "./server/app.js";
import { ensureDaemonClient } from "./server/identity/clients.js";
import { createRegistry } from "./server/connections/registry.js";

const publicUrl = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8787";
const secret = process.env.BETTER_AUTH_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
const port = Number(process.env.PORT ?? (new URL(publicUrl).port || 8787));

if (!secret || secret.length < 32) {
  console.error("Set BETTER_AUTH_SECRET to at least 32 characters. See apps/relay/.env.example.");
  process.exit(1);
}

mkdirSync("data", { recursive: true });
const mukae = await openMukaeAuth({
  database: new Database("data/relay.sqlite"),
  secret,
  publicUrl,
  githubClientId,
  githubClientSecret,
});
const daemonClientId = await ensureDaemonClient(mukae);
const registry = createRegistry();
const { app, injectWebSocket } = createRelayApp({
  registry,
  mukae,
  clients: { daemonClientId },
  githubConfigured: githubClientId.length > 0 && githubClientSecret.length > 0,
  devServerUrl: process.env.WEB_DEV_SERVER_URL,
});

const hostname = process.env.HOST ?? "127.0.0.1";
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Mukae listening on http://${hostname}:${info.port}`);
});
injectWebSocket(server);
