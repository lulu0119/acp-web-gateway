import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { serve } from "@hono/node-server";
import { WebSocket } from "ws";
import { createRelayApp } from "./app.js";
import { createRegistry } from "./registry.js";

test("an online machine accepts one ticket and carries ACP frames", async () => {
  const registry = createRegistry({ openTimeoutMs: 2_000 });
  const { app, injectWebSocket } = createRelayApp({
    registry,
    origins: ["http://127.0.0.1:47100"],
    clients: { exampleClientId: "example-client", daemonClientId: "daemon-client" },
    publicUrl: "https://relay.example.test",
    readUserId: async (request) => request.headers.get("x-user-id") ?? undefined,
  });
  const { server, port } = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    const listening = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({ server: listening, port: info.port });
    });
    injectWebSocket(listening);
  });
  const base = `http://127.0.0.1:${port}`;
  const daemon = new WebSocket(`ws://127.0.0.1:${port}/api/daemon`, { headers: { "x-user-id": "ada" } });
  try {
    await once(daemon, "open");
    const denied = await fetch(`${base}/api/machines`);
    assert.equal(denied.status, 401);
    daemon.send(JSON.stringify({ type: "hello", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] }));
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
