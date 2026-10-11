import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { mountAccountPages } from "./account.js";
import { openMukaeAuth } from "./auth.js";
import { createRelayApp } from "./app.js";
import { ensurePublicClients } from "./clients.js";
import { createRegistry } from "./registry.js";
import { readUserId } from "./session.js";

const publicUrl = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8787";
const secret = process.env.BETTER_AUTH_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
const origins = (process.env.MUKAE_CLIENT_ORIGINS ?? "http://127.0.0.1:47100").split(",").map((origin) => origin.trim()).filter(Boolean);
const redirectUri = process.env.MUKAE_EXAMPLE_REDIRECT_URI ?? "http://127.0.0.1:47100/oauth/callback";
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
const clients = await ensurePublicClients(mukae, { redirectUri });
const { app, injectWebSocket } = createRelayApp({
  registry: createRegistry(),
  origins,
  clients,
  readUserId: (request) => readUserId(request, { jwksUrl: mukae.jwksUrl, issuer: mukae.issuer, audience: mukae.resource }),
});
mountAccountPages(app, mukae, githubClientId.length > 0 && githubClientSecret.length > 0);
app.all("/api/auth/*", (c) => mukae.auth.handler(c.req.raw));
app.get("/", async (c) => {
  const session = await mukae.auth.api.getSession({ headers: c.req.raw.headers });
  const name = session?.user.name;
  const body = name ? `<h1>Mukae</h1><p>Signed in as ${escapeHtml(name)}.</p>` : `<h1>Mukae</h1><p><a href="/sign-in">Sign in</a></p>`;
  return c.html(`<!doctype html><html lang="en"><body>${body}</body></html>`);
});

const hostname = process.env.HOST ?? "127.0.0.1";
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Mukae listening on http://${hostname}:${info.port}`);
});
injectWebSocket(server);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}
