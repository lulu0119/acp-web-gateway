import type { Hono } from "hono";
import type { RelayEnv } from "./app.js";
import type { MukaeAuth } from "./auth.js";
import type { DashboardData } from "./dashboard-data.js";
import type { Registry } from "./registry.js";
import { readAccount, type Account } from "./account-session.js";
import { dashboardShell } from "./web.js";

export function mountDashboard(app: Hono<RelayEnv>, mukae: MukaeAuth, registry: Registry): void {
  app.get("/", async (c) => {
    const account = await readAccount(c.req.raw, mukae);
    if (!account) return c.redirect("/sign-in?next=%2F");
    return c.html(dashboardShell(readDashboard(account, registry)));
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
