import assert from "node:assert/strict";
import { test } from "vitest";
import type { DaemonMessage } from "@exterior/contract";
import type { DashboardData } from "../../shared/account-web.js";
import { openSignedInRelay } from "../testing.js";

const relayUrl = "http://127.0.0.1:8787";

test("the dashboard asks a signed-out account to sign in", async () => {
  const { app } = await openSignedInRelay(relayUrl);
  const home = await app.request(`${relayUrl}/`);
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("location"), "/sign-in?next=%2F");
  const data = await app.request(`${relayUrl}/api/dashboard`);
  assert.equal(data.status, 401);
});

test("a signed-in account sees its own devices and connections", async () => {
  const { app, cookie, devices, registry, userId } = await openSignedInRelay(relayUrl);
  devices.record({ userId, deviceId: "device-studio-1", hostname: "studio" });
  devices.record({ userId: "someone-else", deviceId: "device-elsewhere", hostname: "elsewhere" });
  const daemon = registry.connectDaemon({ userId, close: () => undefined, send: () => undefined });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", deviceId: "device-studio-1", agents: [{ name: "work", agentType: "opencode" }] });
  const other = registry.connectDaemon({ userId: "someone-else", close: () => undefined, send: () => undefined });
  other.receive({ type: "hello", platform: "linux", hostname: "elsewhere", workingDirectory: "/home/ada/work", deviceId: "device-elsewhere", agents: [] });

  const home = await app.request(`${relayUrl}/`, { headers: { cookie } });
  assert.equal(home.status, 200);
  const text = await home.text();
  assert.match(text, /id="props"/);
  assert.match(text, /device-studio-1/);
  assert.doesNotMatch(text, /device-elsewhere/);

  const body = await readDashboard(app, cookie);
  assert.equal(body.userName, "Ada");
  assert.deepEqual(body.devices.map((device) => [device.id, device.hostname, device.online, device.agents.length]), [
    ["device-studio-1", "studio", true, 1],
  ]);
  assert.deepEqual(body.sessions, []);
  daemon.close();
  other.close();
});

test("a device stays listed as offline after its daemon disconnects", async () => {
  const { app, cookie, devices, registry, userId } = await openSignedInRelay(relayUrl);
  devices.record({ userId, deviceId: "device-studio-1", hostname: "studio" });
  const daemon = registry.connectDaemon({ userId, close: () => undefined, send: () => undefined });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", deviceId: "device-studio-1", agents: [{ name: "work", agentType: "opencode" }] });
  daemon.close();

  const [device] = (await readDashboard(app, cookie)).devices;
  assert.equal(device?.id, "device-studio-1");
  assert.equal(device?.online, false);
  assert.equal(typeof device?.lastSeenAt, "number");

  const again = registry.connectDaemon({ userId, close: () => undefined, send: () => undefined });
  again.receive({ type: "hello", platform: "linux", hostname: "studio-renamed", workingDirectory: "/home/ada/work", deviceId: "device-studio-1", agents: [] });
  const listed = (await readDashboard(app, cookie)).devices;
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.hostname, "studio-renamed");
  assert.equal(listed[0]?.online, true);
  again.close();
});

test("a device that reconnects before its old connection closed is listed once", async () => {
  const { app, cookie, devices, registry, userId } = await openSignedInRelay(relayUrl);
  devices.record({ userId, deviceId: "device-studio-1", hostname: "studio" });
  const hello: DaemonMessage = { type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", deviceId: "device-studio-1", agents: [] };
  const stale = registry.connectDaemon({ userId, close: () => undefined, send: () => undefined });
  stale.receive(hello);
  const fresh = registry.connectDaemon({ userId, close: () => undefined, send: () => undefined });
  fresh.receive(hello);
  assert.deepEqual((await readDashboard(app, cookie)).devices.map((device) => device.id), ["device-studio-1"]);
  stale.close();
  fresh.close();
});

test("a daemon for a device id another account holds is turned away", async () => {
  const { app, cookie, devices, registry, userId } = await openSignedInRelay(relayUrl);
  devices.record({ userId: "someone-else", deviceId: "device-taken-1", hostname: "elsewhere" });
  const closed: string[] = [];
  const daemon = registry.connectDaemon({ userId, close: (reason) => closed.push(reason), send: () => undefined });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", deviceId: "device-taken-1", agents: [] });
  assert.deepEqual(closed, ["removed"]);
  assert.deepEqual((await readDashboard(app, cookie)).devices, []);
});

test("removing a device takes it off the list and ends its connection", async () => {
  const { app, cookie, devices, registry, userId } = await openSignedInRelay(relayUrl);
  devices.record({ userId, deviceId: "device-studio-1", hostname: "studio" });
  devices.record({ userId: "someone-else", deviceId: "device-elsewhere", hostname: "elsewhere" });
  const closed: string[] = [];
  const daemon = registry.connectDaemon({ userId, close: (reason) => closed.push(reason), send: () => undefined });
  daemon.receive({ type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", deviceId: "device-studio-1", agents: [] });
  const remove = (deviceId: string, headers: Record<string, string> = { cookie }) => app.request(`${relayUrl}/api/devices/remove`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });

  assert.equal((await remove("device-studio-1", {})).status, 401);
  assert.equal((await remove("device-elsewhere")).status, 404);
  assert.equal(devices.list("someone-else").length, 1);
  assert.equal((await remove("device-studio-1")).status, 200);
  assert.deepEqual(closed, ["removed"]);
  assert.deepEqual((await readDashboard(app, cookie)).devices, []);
  // Its daemon cannot put it back by saying hello again.
  const again = registry.connectDaemon({ userId, close: (reason) => closed.push(reason), send: () => undefined });
  again.receive({ type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", deviceId: "device-studio-1", agents: [] });
  assert.deepEqual(closed, ["removed", "removed"]);
  assert.deepEqual((await readDashboard(app, cookie)).devices, []);
});

test("one account cannot take over another account's device id", async () => {
  const { devices } = await openSignedInRelay(relayUrl);
  assert.equal(devices.record({ userId: "ada", deviceId: "device-shared-1", hostname: "studio" }), true);
  assert.equal(devices.record({ userId: "mallory", deviceId: "device-shared-1", hostname: "evil" }), false);
  assert.deepEqual(devices.list("mallory"), []);
  assert.equal(devices.list("ada")[0]?.hostname, "studio");
});

test("signing out ends the cookie session", async () => {
  const { app, cookie } = await openSignedInRelay(relayUrl);
  const signedOut = await app.request(`${relayUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie, origin: relayUrl, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(signedOut.status, 200);
  const home = await app.request(`${relayUrl}/`, { headers: { cookie } });
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("location"), "/sign-in?next=%2F");
});

async function readDashboard(app: { request: (url: string, init?: RequestInit) => Response | Promise<Response> }, cookie: string): Promise<DashboardData> {
  const response = await app.request(`${relayUrl}/api/dashboard`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return (await response.json()) as DashboardData;
}
