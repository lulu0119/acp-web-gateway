import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "vitest";
import { serve } from "@hono/node-server";
import { WebSocket } from "ws";
import { headerAccess, openTestRelay } from "./testing.js";
import { createRegistry } from "./connections/registry.js";

test("an online machine accepts one ticket and carries ACP frames", async () => {
  const registry = createRegistry({ openTimeoutMs: 2_000 });
  const { app, injectWebSocket, daemonClientId } = await openTestRelay({
    registry,
    publicUrl: "https://relay.example.test",
    readAccess: headerAccess,
  });
  const { server, port } = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    const listening = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({ server: listening, port: info.port });
    });
    injectWebSocket(listening);
  });
  const base = `http://127.0.0.1:${port}`;
  const daemon = new WebSocket(`ws://127.0.0.1:${port}/api/daemon`, { headers: { "x-user-id": "ada", "x-client-id": daemonClientId } });
  try {
    await once(daemon, "open");
    const denied = await fetch(`${base}/api/machines`);
    assert.equal(denied.status, 401);
    daemon.send(JSON.stringify({ type: "hello", hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] }));
    const machineId = await waitForMachine(base);
    const openedSession = waitForOpen(daemon);
    const opened = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "ada" },
      body: JSON.stringify({ machineId, agentName: "work" }),
    });
    assert.equal(opened.status, 200);
    const body = (await opened.json()) as { url: string; agentType: string };
    const sessionId = await openedSession;
    assert.equal(body.agentType, "opencode");
    const ticketUrl = new URL(body.url);
    assert.equal(ticketUrl.protocol, "wss:");
    assert.equal(ticketUrl.host, "relay.example.test");
    const ticket = ticketUrl.searchParams.get("ticket");
    assert.ok(ticket);
    const browser = new WebSocket(`ws://127.0.0.1:${port}/api/acp?ticket=${ticket}`);
    await once(browser, "open");
    const fromBrowser = nextText(daemon);
    browser.send('{"id":1}');
    assert.equal(JSON.parse(await fromBrowser).payload, '{"id":1}');
    const fromDaemon = nextText(browser);
    daemon.send(JSON.stringify({ type: "frame", sessionId, payload: '{"id":2}' }));
    assert.equal(await fromDaemon, '{"id":2}');
    browser.close();
    daemon.close();
  } finally {
    daemon.close();
    server.close();
  }
});

test("a socket that dies before any frame can retake the same ticket", async () => {
  const registry = createRegistry({ openTimeoutMs: 2_000 });
  const { app, injectWebSocket, daemonClientId } = await openTestRelay({
    registry,
    publicUrl: "https://relay.example.test",
    readAccess: headerAccess,
  });
  const { server, port } = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    const listening = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({ server: listening, port: info.port });
    });
    injectWebSocket(listening);
  });
  const base = `http://127.0.0.1:${port}`;
  const daemon = new WebSocket(`ws://127.0.0.1:${port}/api/daemon`, { headers: { "x-user-id": "ada", "x-client-id": daemonClientId } });
  try {
    await once(daemon, "open");
    daemon.send(JSON.stringify({ type: "hello", hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] }));
    const machineId = await waitForMachine(base);
    const openedSession = waitForOpen(daemon);
    const opened = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "ada" },
      body: JSON.stringify({ machineId, agentName: "work" }),
    });
    assert.equal(opened.status, 200);
    const body = (await opened.json()) as { url: string };
    await openedSession;
    const ticket = new URL(body.url).searchParams.get("ticket");
    assert.ok(ticket);

    const ghost = new WebSocket(`ws://127.0.0.1:${port}/api/acp?ticket=${ticket}`);
    await once(ghost, "open");
    ghost.close();
    await once(ghost, "close");
    // No ACP frame flowed, so the machine was never told to close.
    const retake = new WebSocket(`ws://127.0.0.1:${port}/api/acp?ticket=${ticket}`);
    await once(retake, "open");
    const fromBrowser = nextText(daemon);
    retake.send('{"id":1}');
    assert.equal(JSON.parse(await fromBrowser).payload, '{"id":1}');
    retake.close();
    daemon.close();
  } finally {
    daemon.close();
    server.close();
  }
});

test("a second dial on a live ticket closes with ticket-used", async () => {
  const registry = createRegistry({ openTimeoutMs: 2_000 });
  const { app, injectWebSocket, daemonClientId } = await openTestRelay({
    registry,
    publicUrl: "https://relay.example.test",
    readAccess: headerAccess,
  });
  const { server, port } = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    const listening = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({ server: listening, port: info.port });
    });
    injectWebSocket(listening);
  });
  const base = `http://127.0.0.1:${port}`;
  const daemon = new WebSocket(`ws://127.0.0.1:${port}/api/daemon`, { headers: { "x-user-id": "ada", "x-client-id": daemonClientId } });
  try {
    await once(daemon, "open");
    daemon.send(JSON.stringify({ type: "hello", hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }] }));
    const machineId = await waitForMachine(base);
    const openedSession = waitForOpen(daemon);
    const opened = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "ada" },
      body: JSON.stringify({ machineId, agentName: "work" }),
    });
    assert.equal(opened.status, 200);
    const body = (await opened.json()) as { url: string };
    await openedSession;
    const ticket = new URL(body.url).searchParams.get("ticket");
    assert.ok(ticket);

    const live = new WebSocket(`ws://127.0.0.1:${port}/api/acp?ticket=${ticket}`);
    await once(live, "open");
    const fromBrowser = nextText(daemon);
    live.send('{"id":1}');
    assert.equal(JSON.parse(await fromBrowser).payload, '{"id":1}');

    const intruder = new WebSocket(`ws://127.0.0.1:${port}/api/acp?ticket=${ticket}`);
    const [code, reason] = await new Promise<[number, string]>((resolve) => {
      intruder.on("close", (closeCode: number, closeReason: Buffer) => resolve([closeCode, closeReason.toString()]));
    });
    assert.equal(code, 1008);
    assert.equal(reason, "ticket-used");
    live.close();
    daemon.close();
  } finally {
    daemon.close();
    server.close();
  }
});

test("a web app token cannot connect as a daemon, and a daemon token cannot open agents", async () => {
  const { app, injectWebSocket, daemonClientId } = await openTestRelay({
    publicUrl: "https://relay.example.test",
    readAccess: headerAccess,
  });
  const { server, port } = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    const listening = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({ server: listening, port: info.port });
    });
    injectWebSocket(listening);
  });
  try {
    const impostor = new WebSocket(`ws://127.0.0.1:${port}/api/daemon`, { headers: { "x-user-id": "ada", "x-client-id": "web-app" } });
    const status = await new Promise<number>((resolve) => {
      impostor.on("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
      impostor.on("open", () => resolve(101));
    });
    assert.equal(status, 403);
    const listed = await fetch(`http://127.0.0.1:${port}/api/machines`, { headers: { "x-user-id": "ada", "x-client-id": daemonClientId } });
    assert.equal(listed.status, 403);
    const opened = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "ada", "x-client-id": daemonClientId },
      body: JSON.stringify({ machineId: "any-machine", agentName: "work" }),
    });
    assert.equal(opened.status, 403);
  } finally {
    server.close();
  }
});

test("the health check answers without signing in", async () => {
  const { app } = await openTestRelay({
    registry: createRegistry(),
    publicUrl: "https://relay.example.test",
    readAccess: async () => undefined,
  });
  const response = await app.request("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("a web page on another site can read the api", async () => {
  const { app } = await openTestRelay({
    registry: createRegistry(),
    publicUrl: "https://relay.example.test",
    readAccess: async () => undefined,
  });
  const response = await app.request("/api/clients", { headers: { origin: "https://app.example.test" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

async function waitForMachine(base: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${base}/api/machines`, { headers: { "x-user-id": "ada" } });
    const body = (await response.json()) as { machines: { id: string }[] };
    const id = body.machines[0]?.id;
    if (id) return id;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The machine did not appear.");
}

function waitForOpen(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.on("message", function onMessage(data) {
      const message = JSON.parse(data.toString()) as { type?: string; sessionId?: string };
      if (message.type !== "open" || !message.sessionId) return;
      socket.off("message", onMessage);
      socket.send(JSON.stringify({ type: "opened", sessionId: message.sessionId }));
      resolve(message.sessionId);
    });
  });
}

function nextText(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(data.toString()));
  });
}
