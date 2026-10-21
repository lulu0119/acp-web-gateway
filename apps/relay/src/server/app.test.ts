import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "vitest";
import { serve } from "@hono/node-server";
import { WebSocket } from "ws";
import { agentSocketPath, attachCloseCodes, deviceCloseCodes } from "@exterioragentprotocol/sdk";
import { deviceIdOf, dpopProof, generateDeviceKey } from "@exterioragentprotocol/sdk/device";
import { createRegistry } from "@exterioragentprotocol/sdk/relay";
import { headerAccess, openTestRelay } from "./testing.js";

const deviceKey = await generateDeviceKey();
const deviceId = await deviceIdOf(deviceKey);
const device = { "x-user-id": "ada", "x-client-id": "https://exterior.example/device-client.json", "x-scope": "eap:device", "x-device-id": deviceId };
const client = { "x-user-id": "ada" };
const hello = JSON.stringify({ type: "hello", platform: "linux", hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] });

test("a device dials one agent socket per connection, and the ticket joins it to the client's socket", async () => {
  const relay = await listen({ registry: createRegistry({ openTimeoutMs: 2_000 }) });
  const control = new WebSocket(`${relay.ws}/eap/v1/device`, { headers: device });
  try {
    await once(control, "open");
    control.send(hello);
    assert.equal(await waitForDevice(relay.http), deviceId);
    const listed = await fetch(`${relay.http}/eap/v1/devices`, { headers: client });
    assert.deepEqual(await listed.json(), {
      devices: [{ id: deviceId, hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }], platform: "linux" }],
    });
    const agentSocket = dialAgentOnOpen(control, relay.ws);
    const opened = await openConnection(relay.http);
    assert.equal(opened.status, 201);
    const body = (await opened.json()) as { url: string; agentType: string; expiresAt: string };
    const agent = await agentSocket;
    assert.equal(body.agentType, "opencode");
    assert.ok(Date.parse(body.expiresAt) > Date.now());
    const attachUrl = new URL(body.url);
    assert.equal(attachUrl.protocol, "wss:");
    assert.equal(attachUrl.host, "relay.example.test");
    assert.equal(attachUrl.pathname, "/eap/v1/attach");

    const browser = new WebSocket(relay.attach(body.url));
    await once(browser, "open");
    const toAgent = nextText(agent);
    browser.send('{"id":1}');
    assert.equal(await toAgent, '{"id":1}');
    const toBrowser = nextText(browser);
    agent.send('{"id":1,"result":{}}');
    assert.equal(await toBrowser, '{"id":1,"result":{}}');

    // The agent ending closes its socket normally, and the client hears it exited.
    const browserClosed = once(browser, "close");
    agent.close(1000);
    const [code] = (await browserClosed) as [number];
    assert.equal(code, attachCloseCodes.agent_exited);
  } finally {
    control.close();
    relay.close();
  }
});

test("a second dial on a ticket is rejected, and the client closing its socket closes the agent socket", async () => {
  const relay = await listen({ registry: createRegistry({ openTimeoutMs: 2_000 }) });
  const control = new WebSocket(`${relay.ws}/eap/v1/device`, { headers: device });
  try {
    await once(control, "open");
    control.send(hello);
    await waitForDevice(relay.http);
    const agentSocket = dialAgentOnOpen(control, relay.ws);
    const body = (await (await openConnection(relay.http)).json()) as { url: string };
    const agent = await agentSocket;

    const live = new WebSocket(relay.attach(body.url));
    await once(live, "open");
    const second = new WebSocket(relay.attach(body.url));
    const [code, reason] = (await once(second, "close")) as [number, Buffer];
    assert.equal(code, attachCloseCodes.ticket_rejected);
    assert.equal(reason.toString(), "ticket_rejected");

    const agentClosed = once(agent, "close");
    live.close();
    await agentClosed;
  } finally {
    control.close();
    relay.close();
  }
});

test("the device socket ignores an unknown message type and closes on a malformed one, and an agent socket must prove the device key", async () => {
  const relay = await listen({ registry: createRegistry() });
  const strayPath = agentSocketPath("c".repeat(22));
  const unproved = new WebSocket(`${relay.ws}${strayPath}`);
  const [, refused] = (await once(unproved, "unexpected-response")) as [unknown, { statusCode: number }];
  assert.equal(refused.statusCode, 401);
  const stray = new WebSocket(`${relay.ws}${strayPath}`, { headers: { dpop: await dpopProof(deviceKey, "GET", `https://relay.example.test${strayPath}`) } });
  const [strayCode] = (await once(stray, "close")) as [number];
  assert.equal(strayCode, 1008);
  const control = new WebSocket(`${relay.ws}/eap/v1/device`, { headers: device });
  try {
    await once(control, "open");
    control.send(hello);
    await waitForDevice(relay.http);
    control.send(JSON.stringify({ type: "stats", load: 1 }));
    const closed = once(control, "close");
    control.send(JSON.stringify({ type: "open_failed", connectionId: "short" }));
    const [code] = (await closed) as [number];
    assert.equal(code, deviceCloseCodes.invalid_message);
  } finally {
    control.close();
    relay.close();
  }
});

test("a client's token cannot open the device socket, a device's cannot list devices, and a missing one says where to sign in", async () => {
  const relay = await listen({});
  try {
    const impostor = new WebSocket(`${relay.ws}/eap/v1/device`, { headers: client });
    const [, response] = (await once(impostor, "unexpected-response")) as [unknown, { statusCode: number }];
    assert.equal(response.statusCode, 403);
    const asDevice = await fetch(`${relay.http}/eap/v1/devices`, { headers: device });
    assert.equal(asDevice.status, 403);
    assert.equal(((await asDevice.json()) as { code: string }).code, "insufficient_scope");
    const anonymous = await fetch(`${relay.http}/eap/v1/connections`, { method: "POST" });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("www-authenticate"), 'Bearer resource_metadata="https://relay.example.test/.well-known/oauth-protected-resource"');
  } finally {
    relay.close();
  }
});

test("a reconnecting device closes its old socket as replaced, and a socket that stops answering pings is dropped", async () => {
  const relay = await listen({ heartbeatMs: 50 });
  const old = new WebSocket(`${relay.ws}/eap/v1/device`, { headers: device });
  let silent: WebSocket | undefined;
  try {
    await once(old, "open");
    old.send(hello);
    assert.equal(await waitForDevice(relay.http), deviceId);
    const oldClosed = once(old, "close");
    silent = new WebSocket(`${relay.ws}/eap/v1/device`, { headers: device, autoPong: false });
    await once(silent, "open");
    silent.send(hello);
    const [code] = (await oldClosed) as [number];
    assert.equal(code, deviceCloseCodes.replaced);
    const online = await fetch(`${relay.http}/eap/v1/devices`, { headers: client });
    assert.equal(((await online.json()) as { devices: unknown[] }).devices.length, 1);

    await once(silent, "close");
    const listed = await fetch(`${relay.http}/eap/v1/devices`, { headers: client });
    assert.deepEqual(await listed.json(), { devices: [] });
  } finally {
    old.close();
    silent?.close();
    relay.close();
  }
});

test("a device token not bound to a key is refused, and a device without a sign-in is closed as revoked", async () => {
  const unbound = await listen({});
  try {
    const socket = new WebSocket(`${unbound.ws}/eap/v1/device`, { headers: { ...device, "x-device-id": "" } });
    const [, response] = (await once(socket, "unexpected-response")) as [unknown, { statusCode: number }];
    assert.equal(response.statusCode, 401);
  } finally {
    unbound.close();
  }
  const relay = await listen({ deviceSignedIn: async () => false });
  const control = new WebSocket(`${relay.ws}/eap/v1/device`, { headers: device });
  try {
    await once(control, "open");
    const closed = once(control, "close");
    control.send(hello);
    const [code] = (await closed) as [number];
    assert.equal(code, deviceCloseCodes.revoked);
  } finally {
    control.close();
    relay.close();
  }
});

test("the protected resource metadata names the authorization server and the EAP scopes, for any origin", async () => {
  const { app } = await openTestRelay({ publicUrl: "https://relay.example.test", readAccess: async () => undefined });
  const response = await app.request("/.well-known/oauth-protected-resource", { headers: { origin: "https://app.example.test" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await response.json(), {
    resource: "https://relay.example.test",
    authorization_servers: ["https://relay.example.test/api/auth"],
    scopes_supported: ["eap:client", "eap:device", "offline_access"],
    bearer_methods_supported: ["header"],
    dpop_signing_alg_values_supported: ["EdDSA", "ES256", "ES512", "PS256", "RS256"],
  });
  const preflight = await app.request("/eap/v1/connections", {
    method: "OPTIONS",
    headers: { origin: "https://app.example.test", "access-control-request-method": "POST" },
  });
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
});

test("the health check answers without signing in", async () => {
  const { app } = await openTestRelay({ publicUrl: "https://relay.example.test", readAccess: async () => undefined });
  const response = await app.request("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

async function listen(input: Omit<Parameters<typeof openTestRelay>[0], "publicUrl" | "readAccess">) {
  const relay = await openTestRelay({ publicUrl: "https://relay.example.test", readAccess: headerAccess, ...input });
  const { server, port } = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    const listening = serve({ fetch: relay.app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({ server: listening, port: info.port });
    });
    relay.injectWebSocket(listening);
  });
  return {
    devices: relay.devices,
    http: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}`,
    /** The attach address the relay published, reached on this test server. */
    attach: (url: string) => url.replace("wss://relay.example.test", `ws://127.0.0.1:${port}`),
    close: () => server.close(),
  };
}

function openConnection(base: string): Promise<Response> {
  return fetch(`${base}/eap/v1/connections`, {
    method: "POST",
    headers: { "content-type": "application/json", ...client },
    body: JSON.stringify({ deviceId, agentName: "work" }),
  });
}

async function waitForDevice(base: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${base}/eap/v1/devices`, { headers: client });
    const body = (await response.json()) as { devices: { id: string }[] };
    const id = body.devices[0]?.id;
    if (id) return id;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The device did not appear.");
}

/** Answers the next `open` on the device socket as a device does: by dialing that connection's agent socket with a proof of its key. */
function dialAgentOnOpen(control: WebSocket, ws: string): Promise<WebSocket> {
  return new Promise((resolve) => {
    control.on("message", function onMessage(data) {
      const message = JSON.parse(data.toString()) as { type?: string; connectionId?: string };
      if (message.type !== "open" || !message.connectionId) return;
      control.off("message", onMessage);
      const path = agentSocketPath(message.connectionId);
      void dpopProof(deviceKey, "GET", `https://relay.example.test${path}`).then((proof) => {
        const agent = new WebSocket(`${ws}${path}`, { headers: { dpop: proof } });
        agent.once("open", () => resolve(agent));
      });
    });
  });
}

function nextText(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(data.toString()));
  });
}
