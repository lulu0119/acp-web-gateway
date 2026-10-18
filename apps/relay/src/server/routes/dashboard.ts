import { devicesPath } from "@exterior/contract";
import type { Hono } from "hono";
import type { RelayEnv } from "../http.js";
import type { ExteriorAuth } from "../identity/auth.js";
import type { DashboardData, DeviceView } from "../../shared/account-web.js";
import type { AgentCatalog } from "../agents/catalog.js";
import type { Registry } from "../connections/registry.js";
import type { DeviceStore } from "../devices/store.js";
import { deleteDeviceTokens } from "../identity/device-tokens.js";
import { readAccount, type Account } from "../identity/session.js";
import type { PageRenderer } from "../rendering/render-page.js";
import { setupGuide } from "../rendering/setup-guide.js";

export function mountDashboard(app: Hono<RelayEnv>, input: {
  exterior: ExteriorAuth;
  registry: Registry;
  devices: DeviceStore;
  daemonClientId: string;
  render: PageRenderer;
  catalog: AgentCatalog;
}): void {
  app.get("/", async (c) => {
    const account = await readAccount(c.req.raw, input.exterior);
    if (!account) return c.redirect("/sign-in?next=%2F");
    return c.html(input.render.dashboard(await readDashboard(account, input), setupGuide(input.exterior.publicUrl, c.req.header("user-agent"))));
  });

  app.get("/api/dashboard", async (c) => {
    const account = await readAccount(c.req.raw, input.exterior);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    return c.json(await readDashboard(account, input));
  });

  // Removing a device signs it out: its daemon sign-in stops refreshing, and it may not connect again.
  app.post(`${devicesPath}/remove`, async (c) => {
    const account = await readAccount(c.req.raw, input.exterior);
    if (!account) return c.json({ message: "Sign in again." }, 401);
    const body: unknown = await c.req.json().catch(() => undefined);
    const deviceId = typeof body === "object" && body !== null && "deviceId" in body && typeof body.deviceId === "string" ? body.deviceId : undefined;
    if (!deviceId) return c.json({ message: "Choose a device." }, 400);
    if (!input.devices.remove({ userId: account.userId, deviceId })) return c.json({ message: "That device is not on this account." }, 404);
    await deleteDeviceTokens(input.exterior, { userId: account.userId, clientId: input.daemonClientId, deviceId });
    input.registry.disconnectDevice({ userId: account.userId, deviceId });
    return c.json({ removed: true });
  });
}

export async function readDashboard(account: Account, input: { registry: Registry; devices: DeviceStore; catalog: AgentCatalog }): Promise<DashboardData> {
  // A daemon connects only as a device the account registered, so every online device is stored.
  const online = new Map(input.registry.listDevices(account.userId).map((device) => [device.id, device]));
  const devices: DeviceView[] = input.devices.list(account.userId).map((device) => {
    const live = online.get(device.id);
    return live
      ? { id: device.id, hostname: live.hostname, platform: live.platform, online: true, agents: live.agents, lastSeenAt: device.lastSeenAt }
      : { id: device.id, hostname: device.hostname, platform: device.platform, online: false, agents: [], lastSeenAt: device.lastSeenAt };
  });
  const sessions = input.registry.listSessions(account.userId);
  const known = await input.catalog.icons();
  const agentIcons: Record<string, string> = {};
  for (const agentType of [...devices.flatMap((device) => device.agents.map((agent) => agent.agentType)), ...sessions.map((session) => session.agentType)]) {
    const icon = known.get(agentType);
    if (icon) agentIcons[agentType] = icon;
  }
  return { userName: account.userName, userImage: account.userImage, devices, sessions, agentIcons };
}
