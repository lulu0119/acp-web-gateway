import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { WebSocketServer } from "ws";
import { runDaemon } from "./daemon.js";

test("the daemon connects with its access token and says hello", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const seen = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The daemon did not say hello.")), 2_000);
    server.on("connection", (socket, request) => {
      socket.on("message", (data) => {
        clearTimeout(timer);
        resolve(`${request.headers.authorization ?? ""} ${data.toString()}`);
      });
    });
  });
  const controller = new AbortController();
  const running = runDaemon({
    relayUrl: `http://127.0.0.1:${address.port}`,
    accessToken: "token-1",
    hostname: "studio",
    agents: [{ name: "work", agentType: "opencode", env: {} }],
    signal: controller.signal,
    catalog: [{ id: "opencode", name: "OpenCode", binary: { "darwin-aarch64": { cmd: "./opencode", args: ["acp"], env: {} } } }],
  });
  try {
    const message = await seen;
    assert.match(message, /Bearer token-1/);
    assert.match(message, /"type":"hello"/);
    assert.match(message, /studio/);
  } finally {
    controller.abort();
    server.close();
    await running;
  }
});
