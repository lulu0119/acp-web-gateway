import { publicClientsPath, type PublicClients } from "@mukae/contract";
import { createNodeWebSocket } from "@hono/node-ws";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Registry } from "./connections/registry.js";
import type { RelayEnv, ReadUserId } from "./http.js";
import type { MukaeAuth } from "./identity/auth.js";
import { readUserId } from "./identity/session.js";
import { readWebAssets } from "./rendering/assets.js";
import { createPageRenderer } from "./rendering/render-page.js";
import { mountAccountPages } from "./routes/account.js";
import { mountClients } from "./routes/clients.js";
import { mountConnections } from "./routes/connections.js";
import { mountDashboard } from "./routes/dashboard.js";
import { mountSockets } from "./routes/sockets.js";

export function createRelayApp(input: {
  mukae: MukaeAuth;
  registry: Registry;
  clients: PublicClients;
  githubConfigured: boolean;
  publicDir?: string;
  devServerUrl?: string;
  readUserId?: ReadUserId;
}) {
  const app = new Hono<RelayEnv>();
  const sockets = createNodeWebSocket({ app });
  const publicDir = input.publicDir ?? "dist/public";
  const render = createPageRenderer(readWebAssets(publicDir, input.devServerUrl));
  const readAccessAccount = input.readUserId ?? ((request: Request) => readUserId(request, {
    jwksUrl: input.mukae.jwksUrl,
    issuer: input.mukae.issuer,
    audience: input.mukae.resource,
  }));

  app.use("/api/*", cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }));

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get(publicClientsPath, (c) => c.json(input.clients));
  mountAccountPages(app, input.mukae, input.githubConfigured, render);
  mountDashboard(app, input.mukae, input.registry, render);
  mountClients(app, input.mukae);
  mountConnections(app, { registry: input.registry, readUserId: readAccessAccount, publicUrl: input.mukae.publicUrl });
  mountSockets(app, { registry: input.registry, readUserId: readAccessAccount, upgradeWebSocket: sockets.upgradeWebSocket });
  app.use("/assets/*", serveStatic({ root: publicDir }));
  app.all("/api/auth/*", (c) => input.mukae.auth.handler(c.req.raw));

  return { app, injectWebSocket: sockets.injectWebSocket };
}
