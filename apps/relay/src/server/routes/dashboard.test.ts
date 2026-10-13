import assert from "node:assert/strict";
import { test } from "vitest";
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
  const { app, cookie, registry, userId } = await openSignedInRelay(relayUrl);
  const daemon = registry.connectDaemon({ userId, send: () => undefined });
  daemon.receive({ type: "hello", hostname: "studio", deviceId: "device-studio-1", agents: [{ name: "work", agentType: "opencode" }] });
  const other = registry.connectDaemon({ userId: "someone-else", send: () => undefined });
  other.receive({ type: "hello", hostname: "elsewhere", deviceId: "device-elsewhere", agents: [] });

  const home = await app.request(`${relayUrl}/`, { headers: { cookie } });
  assert.equal(home.status, 200);
  const text = await home.text();
  assert.match(text, /id="props"/);
  assert.match(text, /device-studio-1/);
  assert.doesNotMatch(text, /device-elsewhere/);

  const body = await readDashboard(app, cookie);
  assert.equal(body.userName, "Ada");
  assert.deepEqual(body.devices.map((device) => [device.id, device.hostname, Boolean(device.machineId), device.agents.length]), [
    ["device-studio-1", "studio", true, 1],
  ]);
  assert.deepEqual(body.sessions, []);
  daemon.close();
  other.close();
});

test("a device stays listed as offline after its daemon disconnects", async () => {
  const { app, cookie, registry, userId } = await openSignedInRelay(relayUrl);
  const daemon = registry.connectDaemon({ userId, send: () => undefined });
  daemon.receive({ type: "hello", hostname: "studio", deviceId: "device-studio-1", agents: [{ name: "work", agentType: "opencode" }] });
  daemon.close();

  const [device] = (await readDashboard(app, cookie)).devices;
  assert.equal(device?.id, "device-studio-1");
  assert.equal(device?.machineId, undefined);
  assert.equal(typeof device?.lastSeenAt, "number");

  const again = registry.connectDaemon({ userId, send: () => undefined });
  again.receive({ type: "hello", hostname: "studio-renamed", deviceId: "device-studio-1", agents: [] });
  const devices = (await readDashboard(app, cookie)).devices;
  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.hostname, "studio-renamed");
  assert.ok(devices[0]?.machineId);
  again.close();
});

test("a daemon too old to name its device is listed only while connected", async () => {
  const { app, cookie, registry, userId } = await openSignedInRelay(relayUrl);
  const daemon = registry.connectDaemon({ userId, send: () => undefined });
  daemon.receive({ type: "hello", hostname: "legacy", agents: [] });
  assert.deepEqual((await readDashboard(app, cookie)).devices.map((device) => device.hostname), ["legacy"]);
  daemon.close();
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
