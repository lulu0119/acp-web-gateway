import type { Context, Hono } from "hono";
import type { RelayEnv } from "../http.js";
import type { MukaeAuth } from "../identity/auth.js";
import {
  decideConsent,
  decideDevice,
  readConsent,
  readDevice,
  readSignIn,
  signInWithGitHub,
  type AccountResult,
} from "../identity/account.js";
import type { PageRenderer } from "../rendering/render-page.js";

export function mountAccountPages(app: Hono<RelayEnv>, mukae: MukaeAuth, configured: boolean, render: PageRenderer): void {
  app.get("/sign-in", async (c) => respond(c, await readSignIn(c.req.raw, mukae, configured), render));

  app.post("/sign-in/github", async (c) => {
    const body = await c.req.parseBody();
    const query = typeof body.query === "string" ? body.query : "";
    return respond(c, await signInWithGitHub(c.req.raw, mukae, query), render);
  });

  app.get("/consent", async (c) => respond(c, await readConsent(c.req.raw, mukae), render));

  app.post("/consent", async (c) => {
    const body = await c.req.parseBody();
    const query = typeof body.query === "string" ? body.query : "";
    return respond(c, await decideConsent(c.req.raw, mukae, query, body.accept === "yes"), render);
  });

  app.get("/device", async (c) => respond(c, await readDevice(c.req.raw, mukae, c.req.query("user_code") ?? ""), render));

  app.post("/device", async (c) => {
    const body = await c.req.parseBody();
    const userCode = typeof body.userCode === "string" ? body.userCode : "";
    return respond(c, await decideDevice(c.req.raw, mukae, userCode, body.decision === "approve"), render);
  });
}

function respond(c: Context<RelayEnv>, result: AccountResult, render: PageRenderer): Response {
  if ("page" in result) return c.html(render.account(result.page), result.status);
  const response = c.redirect(result.redirect);
  for (const cookie of result.headers?.getSetCookie() ?? []) response.headers.append("set-cookie", cookie);
  return response;
}
