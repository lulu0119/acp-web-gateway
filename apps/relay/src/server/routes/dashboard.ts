import type { Hono } from "hono";
import type { RelayEnv } from "../http.js";
import type { MukaeAuth } from "../identity/auth.js";
import type { DashboardData } from "../../shared/account-web.js";
import type { Registry } from "../connections/registry.js";
import { readAccount, type Account } from "../identity/session.js";
import type { PageRenderer } from "../rendering/render-page.js";

export function mountDashboard(app: Hono<RelayEnv>, mukae: MukaeAuth, registry: Registry, render: PageRenderer): void {
  app.get("/", async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.redirect("/sign-in?next=%2F");
    return c.html(render.dashboard(readDashboard(account, registry)));
  });

  app.get("/api/dashboard", async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    return c.json(readDashboard(account, registry));
  });
}

function readDashboard(account: Account, registry: Registry): DashboardData {
  return {
    userName: account.userName,
    machines: registry.listMachines(account.userId),
    sessions: registry.listSessions(account.userId),
  };
}
