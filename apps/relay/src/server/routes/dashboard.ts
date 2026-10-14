import type { Hono } from "hono";
import type { RelayEnv } from "../http.js";
import type { ExteriorAuth } from "../identity/auth.js";
import type { DashboardData, DeviceView } from "../../shared/account-web.js";
import type { Registry } from "../connections/registry.js";
import type { DeviceStore } from "../devices/store.js";
import { readAccount, type Account } from "../identity/session.js";
import type { PageRenderer } from "../rendering/render-page.js";
import { setupGuide } from "../rendering/setup-guide.js";

export function mountDashboard(app: Hono<RelayEnv>, input: {
  exterior: ExteriorAuth;
  registry: Registry;
  devices: DeviceStore;
  render: PageRenderer;
}): void {
  app.get("/", async (c) => {
    const account = await readAccount(c.req.raw, input.exterior);
    if (!account) return c.redirect("/sign-in?next=%2F");
    return c.html(input.render.dashboard(readDashboard(account, input), setupGuide(input.exterior.publicUrl)));
  });

  app.get("/api/dashboard", async (c) => {
    const account = await readAccount(c.req.raw, input.exterior);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    return c.json(readDashboard(account, input));
  });
}

export function readDashboard(account: Account, input: { registry: Registry; devices: DeviceStore }): DashboardData {
  const live = input.registry.listMachines(account.userId);
  const devices: DeviceView[] = input.devices.list(account.userId).map((device) => {
    const machine = live.find((item) => item.deviceId === device.id);
    return machine
      ? { id: device.id, hostname: machine.hostname, machineId: machine.id, agents: machine.agents, lastSeenAt: device.lastSeenAt }
      : { id: device.id, hostname: device.hostname, agents: [], lastSeenAt: device.lastSeenAt };
  });
  for (const machine of live) {
    if (devices.some((device) => device.machineId === machine.id)) continue;
    devices.push({ id: machine.id, hostname: machine.hostname, machineId: machine.id, agents: machine.agents });
  }
  return { userName: account.userName, userImage: account.userImage, devices, sessions: input.registry.listSessions(account.userId) };
}
