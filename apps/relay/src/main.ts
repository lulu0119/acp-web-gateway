import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import Database from "better-sqlite3";
import { mountAccountPages } from "./account.js";
import { openMukaeAuth } from "./auth.js";
import { createRelayApp } from "./app.js";
import { ensureDaemonClient } from "./clients.js";
import { mountDashboard } from "./dashboard.js";
import { mountClientRegistry } from "./grants.js";
import { createRegistry } from "./registry.js";
import { readUserId } from "./session.js";

const publicUrl = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8787";
const secret = process.env.BETTER_AUTH_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
const origins = (process.env.MUKAE_CLIENT_ORIGINS ?? "http://127.0.0.1:47100").split(",").map((origin) => origin.trim()).filter(Boolean);
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
  origins,
});
const daemonClientId = await ensureDaemonClient(mukae);
const registry = createRegistry();
const { app, injectWebSocket } = createRelayApp({
  registry,
  origins,
  clients: { daemonClientId },
  publicUrl,
  readUserId: (request) => readUserId(request, { jwksUrl: mukae.jwksUrl, issuer: mukae.issuer, audience: mukae.resource }),
});
mountAccountPages(app, mukae, githubClientId.length > 0 && githubClientSecret.length > 0);
mountDashboard(app, mukae, registry);
mountClientRegistry(app, mukae);
app.use("/assets/*", serveStatic({ root: "./dist/public" }));
app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));

const hostname = process.env.HOST ?? "127.0.0.1";
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Mukae listening on http://${hostname}:${info.port}`);
});
injectWebSocket(server);
