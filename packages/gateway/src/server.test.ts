import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { WebSocket } from "ws";
import { buildWebSocketUrl } from "@mukae/contract";
import { startGatewayServer, type AgentProcess } from "./server.js";

const origin = "https://app.example";
const nonce = "nonce-1234";

const echoAgent: AgentProcess = {
  command: process.execPath,
  args: ["-e", "process.stdin.pipe(process.stdout)"],
  env: {},
};

test("status and socket follow the launch nonce and origin, then frames pass through", async () => {
  const gateway = await startGatewayServer({
    expectedNonce: nonce,
    expectedOrigin: origin,
    port: 0,
    idleTimeoutMs: 15_000,
    initial: { status: "waiting", agent: echoAgent },
  });
  try {
    const hidden = await requestStatus(gateway.port, "https://other.example");
    assert.equal(hidden.statusCode, 403);

    const visible = await requestStatus(gateway.port, origin);
    assert.equal(visible.statusCode, 200);
    assert.equal(visible.body, JSON.stringify({ status: "waiting" }));
    assert.equal(visible.allowOrigin, origin);
    assert.equal(visible.allowPrivateNetwork, "true");

    const rejected = new WebSocket(buildWebSocketUrl({ port: gateway.port, nonce: "other-nonce" }), {
      headers: { Origin: origin },
    });
    const rejectedStatus = await new Promise<number>((resolve, reject) => {
      rejected.once("error", () => {});
      rejected.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
      rejected.once("open", () => reject(new Error("mismatched nonce was accepted")));
    });
    assert.equal(rejectedStatus, 403);

    const accepted = new WebSocket(buildWebSocketUrl({ port: gateway.port, nonce }), {
      headers: { Origin: origin },
    });
    await once(accepted, "open");
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 1 });
    const echoed = onceMessage(accepted);
    accepted.send(payload);
    assert.equal(await echoed, payload);
    accepted.close();
    await gateway.finished;
  } finally {
    gateway.stop();
    await gateway.finished;
  }
});

test("an unconfigured type is reported without names and does not accept a socket", async () => {
  const gateway = await startGatewayServer({
    expectedNonce: nonce,
    expectedOrigin: origin,
    port: 0,
    idleTimeoutMs: 15_000,
    initial: { status: "unconfigured" },
  });
  try {
    const visible = await requestStatus(gateway.port, origin);
    assert.equal(visible.body, JSON.stringify({ status: "unconfigured" }));
    assert.equal(await socketStatus(gateway.port), 403);
  } finally {
    gateway.stop();
    await gateway.finished;
  }
});

test("several configurations stay closed until a local choice, and the status has no names", async () => {
  const gateway = await startGatewayServer({
    expectedNonce: nonce,
    expectedOrigin: origin,
    port: 0,
    idleTimeoutMs: 15_000,
    initial: { status: "choosing" },
  });
  try {
    const choosing = await requestStatus(gateway.port, origin);
    assert.equal(choosing.body, JSON.stringify({ status: "choosing" }));
    assert.equal(await socketStatus(gateway.port), 403);

    gateway.finishChoice({
      command: process.execPath,
      args: [
        "-e",
        "process.stdin.on('data', (chunk) => { if (process.env.MARKER !== 'from-config') process.exit(1); process.stdout.write(chunk); })",
      ],
      env: { MARKER: "from-config" },
    });
    const waiting = await requestStatus(gateway.port, origin);
    assert.equal(waiting.body, JSON.stringify({ status: "waiting" }));

    const accepted = new WebSocket(buildWebSocketUrl({ port: gateway.port, nonce }), {
      headers: { Origin: origin },
    });
    await once(accepted, "open");
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 2 });
    const echoed = onceMessage(accepted);
    accepted.send(payload);
    assert.equal(await echoed, payload);
    accepted.close();
    await gateway.finished;
  } finally {
    gateway.stop();
    await gateway.finished;
  }
});

test("stdout bytes split mid-character stay one frame", async () => {
  const gateway = await startGatewayServer({
    expectedNonce: nonce,
    expectedOrigin: origin,
    port: 0,
    idleTimeoutMs: 15_000,
    initial: {
      status: "waiting",
      agent: {
        command: process.execPath,
        args: [
          "-e",
          "process.stdout.write(Buffer.from([0xe2])); setTimeout(() => process.stdout.write(Buffer.from([0x82, 0xac, 0x0a])), 30);",
        ],
        env: {},
      },
    },
  });
  try {
    const accepted = new WebSocket(buildWebSocketUrl({ port: gateway.port, nonce }), {
      headers: { Origin: origin },
    });
    await once(accepted, "open");
    assert.equal(await onceMessage(accepted), "€");
    accepted.close();
    await gateway.finished;
  } finally {
    gateway.stop();
    await gateway.finished;
  }
});

test("a socket frame after the agent exits ends the gateway", async () => {
  const gateway = await startGatewayServer({
    expectedNonce: nonce,
    expectedOrigin: origin,
    port: 0,
    idleTimeoutMs: 15_000,
    initial: {
      status: "waiting",
      agent: { command: process.execPath, args: ["-e", "process.exit(0)"], env: {} },
    },
  });
  try {
    const accepted = new WebSocket(buildWebSocketUrl({ port: gateway.port, nonce }), {
      headers: { Origin: origin },
    });
    accepted.on("error", () => {});
    await once(accepted, "open");
    accepted.send(JSON.stringify({ id: 1 }));
    await gateway.finished;
  } finally {
    gateway.stop();
    await gateway.finished;
  }
});

test("cancelling the local choice rejects the socket", async () => {
  const gateway = await startGatewayServer({
    expectedNonce: nonce,
    expectedOrigin: origin,
    port: 0,
    idleTimeoutMs: 15_000,
    initial: { status: "choosing" },
  });
  try {
    gateway.finishChoice(undefined);
    const visible = await requestStatus(gateway.port, origin);
    assert.equal(visible.body, JSON.stringify({ status: "cancelled" }));
    assert.equal(await socketStatus(gateway.port), 403);
  } finally {
    gateway.stop();
    await gateway.finished;
  }
});

function requestStatus(
  port: number,
  requestOrigin: string,
): Promise<{ statusCode: number; body: string; allowOrigin?: string; allowPrivateNetwork?: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/status",
        method: "GET",
        headers: { Origin: requestOrigin },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            allowOrigin: header(response.headers["access-control-allow-origin"]),
            allowPrivateNetwork: header(response.headers["access-control-allow-private-network"]),
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

function socketStatus(port: number): Promise<number> {
  const socket = new WebSocket(buildWebSocketUrl({ port, nonce }), { headers: { Origin: origin } });
  return new Promise((resolve, reject) => {
    socket.once("error", () => {});
    socket.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
    socket.once("open", () => reject(new Error("socket was accepted")));
  });
}

function header(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function once(socket: WebSocket, event: "open"): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once(event, () => resolve());
    socket.once("error", reject);
  });
}

function onceMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(data.toString()));
    socket.once("error", reject);
    socket.once("close", () => reject(new Error("socket closed before a frame arrived")));
  });
}
