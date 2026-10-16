import { publicClientsPath, type PublicClients } from "@exterior/contract";
import { createNodeWebSocket } from "@hono/node-ws";
import { serveStatic } from "@hono/node-server/serve-static";
import { useLogg } from "@guiiai/logg";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Registry } from "./connections/registry.js";
import type { DeviceStore } from "./devices/store.js";
import type { RelayEnv, ReadAccess } from "./http.js";
import type { ExteriorAuth } from "./identity/auth.js";
import { askConsentForLoopback } from "./identity/clients.js";
import { readAccess } from "./identity/session.js";
import { readWebAssets } from "./rendering/assets.js";
import { createPageRenderer } from "./rendering/render-page.js";
import { mountAccountPages } from "./routes/account.js";
import { mountClients } from "./routes/clients.js";
import { mountConnections } from "./routes/connections.js";
import { mountDashboard } from "./routes/dashboard.js";
import { mountSockets } from "./routes/sockets.js";

const log = useLogg("relay").useGlobalConfig();

export function createRelayApp(input: {
  exterior: ExteriorAuth;
  registry: Registry;
  devices: DeviceStore;
  clients: PublicClients;
  githubConfigured: boolean;
  publicDir?: string;
  devServerUrl?: string;
  readAccess?: ReadAccess;
  /** How often sockets are pinged; tests shorten it. */
  heartbeatMs?: number;
}) {
  const app = new Hono<RelayEnv>();
  const sockets = createNodeWebSocket({ app });
  const publicDir = input.publicDir ?? "dist/public";
  const render = createPageRenderer(readWebAssets(publicDir, input.devServerUrl));
  const readAccessAccount = input.readAccess ?? ((request: Request) => readAccess(request, {
    jwksUrl: input.exterior.jwksUrl,
    issuer: input.exterior.issuer,
    audience: input.exterior.resource,
  }));
  const daemonClientId = input.clients.daemonClientId;

  app.onError((error, c) => {
    log.withError(error).withFields({ method: c.req.method, path: c.req.path }).error("Request failed");
    if (c.req.path.startsWith("/api/")) return c.json({ message: "Exterior hit an error. Try again." }, 500);
    return c.html(render.account({
      kind: "message",
      tone: "error",
      title: "Something went wrong",
      message: "Exterior could not finish this step. Try again; if it keeps failing, start over from the app or your device.",
      action: { label: "Try again", href: c.req.method === "GET" ? c.req.url : "/" },
    }), 500);
  });

  // Approve buttons must not be framed by another site and clicked through.
  app.use("*", async (c, next) => {
    await next();
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/assets/")) return;
    c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", "frame-ancestors 'none'");
  });

  app.use("/api/*", cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }));

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get(publicClientsPath, (c) => c.json(input.clients));
  mountAccountPages(app, input.exterior, input.githubConfigured, render);
  mountDashboard(app, { exterior: input.exterior, registry: input.registry, devices: input.devices, daemonClientId, render });
  mountClients(app, input.exterior);
  mountConnections(app, {
    exterior: input.exterior,
    registry: input.registry,
    devices: input.devices,
    readAccess: readAccessAccount,
    daemonClientId,
    publicUrl: input.exterior.publicUrl,
  });
  mountSockets(app, {
    registry: input.registry,
    readAccess: readAccessAccount,
    daemonClientId,
    upgradeWebSocket: sockets.upgradeWebSocket,
    heartbeatMs: input.heartbeatMs,
  });
  app.use("/assets/*", serveStatic({ root: publicDir }));
  app.all("/api/auth/*", (c) => input.exterior.auth.handler(askConsentForLoopback(c.req.raw)));

  return { app, injectWebSocket: sockets.injectWebSocket };
}
