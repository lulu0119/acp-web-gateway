import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Format, LogLevel, initLogger, useLogg } from "@guiiai/logg";
import Database from "better-sqlite3";
import { openMukaeAuth } from "./server/identity/auth.js";
import { createRelayApp } from "./server/app.js";
import { ensureDaemonClient } from "./server/identity/clients.js";
import { createRegistry } from "./server/connections/registry.js";
import { openDeviceStore } from "./server/devices/store.js";

initLogger(LogLevel.Log, process.env.LOG_FORMAT === "json" ? Format.JSON : Format.Pretty);
const log = useLogg("relay").useGlobalConfig();

const publicUrl = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8787";
const secret = process.env.BETTER_AUTH_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
const port = Number(process.env.PORT ?? (new URL(publicUrl).port || 8787));

if (!secret || secret.length < 32) {
  log.error("Set BETTER_AUTH_SECRET to at least 32 characters. See apps/relay/.env.example.");
  process.exit(1);
}

mkdirSync("data", { recursive: true });
const database = new Database("data/relay.sqlite");
const mukae = await openMukaeAuth({
  database,
  secret,
  publicUrl,
  githubClientId,
  githubClientSecret,
});
const daemonClientId = await ensureDaemonClient(mukae);
const devices = openDeviceStore(database);
const registry = createRegistry({ seen: (device) => devices.record(device) });
const { app, injectWebSocket } = createRelayApp({
  registry,
  devices,
  mukae,
  clients: { daemonClientId },
  githubConfigured: githubClientId.length > 0 && githubClientSecret.length > 0,
  devServerUrl: process.env.WEB_DEV_SERVER_URL,
});

const hostname = process.env.HOST ?? "127.0.0.1";
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  log.withFields({ url: `http://${hostname}:${info.port}`, publicUrl }).log("Mukae listening");
});
injectWebSocket(server);
