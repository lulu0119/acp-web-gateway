import { publicClientsPath, type PublicClients } from "@exterior/contract";
import { createNodeWebSocket } from "@hono/node-ws";
import { serveStatic } from "@hono/node-server/serve-static";
import { useLogg } from "@guiiai/logg";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AccountPage } from "../shared/account-web.js";
import { createAgentCatalog, type AgentCatalog } from "./agents/catalog.js";
import type { Registry } from "@exterioragentprotocol/sdk/relay";
import type { DeviceStore } from "./devices/store.js";
import type { RelayEnv, ReadAccess } from "./http.js";
import type { ExteriorAuth } from "./identity/auth.js";
import { isBrowserAuthorizeRequest, readBrowserAuthorizeError } from "./identity/authorize-error.js";
import { guardAuthRequest } from "./identity/clients.js";
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
  catalog?: AgentCatalog;
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

  function errorPage(page: AccountPage, response: Response): Response {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("Content-Type", "text/html; charset=UTF-8");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    headers.set("Referrer-Policy", "no-referrer");
    headers.append("Vary", "Accept");
    return new Response(render.account(page), { status: response.status, headers });
  }

  app.onError((error, c) => {
    log.withError(error).withFields({ method: c.req.method, path: c.req.path }).error("Request failed");
    if (c.req.path.startsWith("/api/") && !isBrowserAuthorizeRequest(c.req.raw)) return c.json({ message: "Exterior hit an error. Try again." }, 500);
    return errorPage({
      kind: "message",
      tone: "error",
      title: "Something went wrong",
      message: c.req.method === "GET"
        ? "Exterior could not finish this step. Try again; if it keeps failing, start over from the app or your device."
        : "Exterior could not finish this step. Start again from the app or your device.",
      action: c.req.method === "GET" ? { label: "Try again", href: c.req.url } : undefined,
    }, new Response(null, { status: 500 }));
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
  const catalog = input.catalog ?? createAgentCatalog();
  mountDashboard(app, { exterior: input.exterior, registry: input.registry, devices: input.devices, daemonClientId, render, catalog });
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
  app.all("/api/auth/*", async (c) => {
    const guarded = await guardAuthRequest(input.exterior, c.req.raw);
    if (guarded instanceof Response) return guarded;
    const response = await input.exterior.auth.handler(guarded);
    const page = await readBrowserAuthorizeError(c.req.raw, response);
    if (!page) return response;
    return errorPage(page, response);
  });

  return { app, injectWebSocket: sockets.injectWebSocket };
}
