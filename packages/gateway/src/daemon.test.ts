import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, vi } from "vitest";
import { WebSocketServer } from "ws";
import { runDaemon } from "./daemon.js";
import { usableSignIn } from "./login.js";
import { readSignIn, writeSignIn } from "./sign-ins.js";

const workingDirectory = join(tmpdir(), "exterior-daemon-workspace");

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
    getAccessToken: async () => "token-1",
    inform: () => undefined,
    hostname: "studio", workingDirectory,
    agents: [{ name: "work", agentType: "opencode", env: {} }],
    signal: controller.signal,
    catalog: [{ id: "opencode", name: "OpenCode", binary: { "darwin-aarch64": { cmd: "./opencode", args: ["acp"], env: {} } } }],
  });
  try {
    const message = await seen;
    assert.match(message, /Bearer token-1/);
    assert.match(message, /"type":"hello"/);
    assert.match(message, /studio/);
    assert.equal(JSON.parse(message.slice(message.indexOf("{"))).workingDirectory, workingDirectory);
  } finally {
    controller.abort();
    server.close();
    await running;
  }
});

test("the daemon obtains a fresh token when reconnecting after an hour", async () => {
  let now = 1_700_000_000_000;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const relay = await daemonRelay();
  const controller = new AbortController();
  const lines: string[] = [];
  const reconnected = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No authenticated reconnect: ${relay.tokens.join(", ")}`)), 3_500);
    relay.sockets.on("connection", (socket) => {
      socket.once("message", () => {
        if (relay.tokens.length < 3) {
          now += 3_600_000;
          socket.close();
        } else {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  });
  const running = runDaemon({
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", workingDirectory,
    agents: [],
    signal: controller.signal,
    catalog: [],
  });
  try {
    await reconnected;
    assert.deepEqual(relay.tokens, ["Bearer access-1", "Bearer access-2", "Bearer access-3"]);
    assert.deepEqual(relay.refreshes, ["refresh-1", "refresh-2"]);
    const saved = await readSignIn(relay.origin, relay.home);
    assert.equal(saved?.refreshToken, "refresh-3");
    assert.equal(saved?.accessToken, "access-3");
    assert.equal(saved?.expiresAt, now + 3_600_000);
    assert.equal(lines.filter((line) => line === "Connected to relay.").length, 3);
    assert.equal(lines.filter((line) => line === "Access token refreshed.").length, 2);
    assert.ok(lines.some((line) => line.startsWith("Relay disconnected")));
    assert.doesNotMatch(lines.join("\n"), /access-[123]|refresh-[123]/);
  } finally {
    controller.abort();
    await running;
    await relay.close();
    clock.mockRestore();
  }
});

test("a 401 forces refresh even when the stored token has not expired", async () => {
  const relay = await daemonRelay({ authorize: (token) => token === "Bearer access-2" });
  const controller = new AbortController();
  const lines: string[] = [];
  const hello = nextHello(relay.sockets);
  const running = runDaemon({
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", workingDirectory, agents: [], catalog: [], signal: controller.signal,
  });
  try {
    await hello;
    assert.deepEqual(relay.tokens, ["Bearer access-1", "Bearer access-2"]);
    assert.deepEqual(relay.refreshes, ["refresh-1"]);
    assert.ok(lines.some((line) => line.includes("HTTP 401")));
    assert.ok(lines.includes("Access token refreshed."));
    assert.doesNotMatch(lines.join("\n"), /access-[12]|refresh-[12]/);
  } finally {
    controller.abort();
    await running;
    await relay.close();
  }
});

test("a second 401 after refresh stops instead of refreshing forever", async () => {
  const relay = await daemonRelay({ authorize: () => false });
  try {
    await assert.rejects(runDaemon({
      relayUrl: relay.origin,
      getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
      inform: () => undefined,
      hostname: "studio", workingDirectory, agents: [], catalog: [],
      signal: AbortSignal.timeout(2_000),
    }), /Relay rejected the refreshed access token. Run exterior login --relay http:\/\/127\.0\.0\.1:\d+ again\./);
    assert.deepEqual(relay.tokens, ["Bearer access-1", "Bearer access-2"]);
    assert.deepEqual(relay.refreshes, ["refresh-1"]);
  } finally {
    await relay.close();
  }
});

test.each(["invalid_grant", "invalid_client", "unauthorized_client", "access_denied"])("a rejected refresh token (%s) requires login and preserves the saved session", async (error) => {
  const relay = await daemonRelay({
    authorize: () => false,
    refreshResponses: [{ status: 400, body: { error } }],
  });
  try {
    await assert.rejects(runDaemon({
      relayUrl: relay.origin,
      getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
      inform: () => undefined,
      hostname: "studio", workingDirectory, agents: [], catalog: [],
      signal: AbortSignal.timeout(2_000),
    }), /Run exterior login --relay http:\/\/127\.0\.0\.1:\d+ again\./);
    assert.deepEqual(relay.tokens, ["Bearer access-1"]);
    assert.deepEqual(relay.refreshes, ["refresh-1"]);
    assert.equal((await readSignIn(relay.origin, relay.home))?.refreshToken, "refresh-1");
  } finally {
    await relay.close();
  }
});

test("refresh without a replacement refresh token keeps the previous one", async () => {
  const relay = await daemonRelay({
    authorize: (token) => token === "Bearer access-2",
    expiresAt: 0,
    refreshResponses: [{ status: 200, body: { access_token: "access-2", token_type: "bearer", expires_in: 3600 } }],
  });
  const controller = new AbortController();
  const hello = nextHello(relay.sockets);
  const running = runDaemon({
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: () => undefined,
    hostname: "studio", workingDirectory, agents: [], catalog: [], signal: controller.signal,
  });
  try {
    await hello;
    assert.deepEqual(relay.refreshes, ["refresh-1"]);
    assert.equal((await readSignIn(relay.origin, relay.home))?.refreshToken, "refresh-1");
  } finally {
    controller.abort();
    await running;
    await relay.close();
  }
});

test("the daemon cannot use credentials saved for a different relay", async () => {
  const relay = await daemonRelay();
  try {
    await assert.rejects(usableSignIn({ relayUrl: "http://127.0.0.1:8787", homeDirectory: relay.home }), /not signed in to http:\/\/127\.0\.0\.1:8787\. Run exterior login --relay http:\/\/127\.0\.0\.1:8787\./);
    assert.deepEqual(relay.refreshes, []);
    assert.deepEqual(relay.tokens, []);
  } finally {
    await relay.close();
  }
});

test.each([false, true])("transient refresh failure is retried (forced refresh: %s)", async (forced) => {
  const relay = await daemonRelay({
    authorize: (token) => token !== "Bearer access-1",
    expiresAt: Date.now() + (forced ? 3_600_000 : 30_000),
    refreshResponses: [{ status: 503, body: { error: "temporarily_unavailable" } }],
  });
  const controller = new AbortController();
  const lines: string[] = [];
  const hello = nextHello(relay.sockets);
  const running = runDaemon({
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", workingDirectory, agents: [], catalog: [], signal: controller.signal,
  });
  try {
    await hello;
    assert.deepEqual(relay.refreshes, ["refresh-1", "refresh-1"]);
    assert.ok(lines.includes("Could not obtain an access token."));
    assert.ok(lines.includes("Retrying in 1s."));
    assert.ok(lines.includes("Connected to relay."));
  } finally {
    controller.abort();
    await running;
    await relay.close();
  }
});

test("a temporary relay handshake failure retries without refreshing credentials", async () => {
  let attempts = 0;
  const relay = await daemonRelay({ authorize: () => ++attempts > 1, handshakeStatus: 503 });
  const controller = new AbortController();
  const lines: string[] = [];
  const hello = nextHello(relay.sockets);
  const running = runDaemon({
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", workingDirectory, agents: [], catalog: [], signal: controller.signal,
  });
  try {
    await hello;
    assert.deepEqual(relay.tokens, ["Bearer access-1", "Bearer access-1"]);
    assert.deepEqual(relay.refreshes, []);
    assert.ok(lines.includes("Relay handshake failed (HTTP 503)."));
    assert.ok(lines.includes("Retrying in 1s."));
  } finally {
    controller.abort();
    await running;
    await relay.close();
  }
});

test("stopping the daemon cancels an in-flight token refresh", async () => {
  const relay = await daemonRelay({ expiresAt: 0, hangRefresh: true });
  const controller = new AbortController();
  relay.http.on("request", (request) => {
    if (request.url === "/api/auth/oauth2/token") controller.abort();
  });
  try {
    await runDaemon({
      relayUrl: relay.origin,
      getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
      inform: () => undefined,
      hostname: "studio", workingDirectory, agents: [], catalog: [], signal: controller.signal,
    });
    assert.ok(controller.signal.aborted);
    assert.deepEqual(relay.tokens, []);
  } finally {
    await relay.close();
  }
});

function nextHello(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The daemon did not say hello.")), 3_500);
    server.once("connection", (socket) => {
      socket.once("message", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
}

async function daemonRelay(input: {
  authorize?: (token: string) => boolean;
  handshakeStatus?: number;
  expiresAt?: number;
  refreshResponses?: { status: number; body: unknown }[];
  hangRefresh?: boolean;
} = {}) {
  const tokens: string[] = [];
  const refreshes: string[] = [];
  let issued = 1;
  const http = createServer((request, response) => {
    const json = (body: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.url === "/api/clients") return json({ daemonClientId: "daemon-client" });
    if (request.url === "/api/auth/.well-known/openid-configuration") {
      return json({ issuer: `${origin}/api/auth`, token_endpoint: `${origin}/api/auth/oauth2/token` });
    }
    if (request.url === "/api/auth/oauth2/token") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const params = new URLSearchParams(Buffer.concat(chunks).toString());
        assert.equal(params.get("grant_type"), "refresh_token");
        assert.equal(params.get("client_id"), "daemon-client");
        refreshes.push(params.get("refresh_token") ?? "");
        if (input.hangRefresh) return;
        const override = input.refreshResponses?.shift();
        if (override) return json(override.body, override.status);
        issued += 1;
        json({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, token_type: "bearer", expires_in: 3600 });
      });
      return;
    }
    response.writeHead(404).end();
  });
  const sockets = new WebSocketServer({
    server: http,
    verifyClient(info, done) {
      const token = info.req.headers.authorization ?? "";
      tokens.push(token);
      done(input.authorize ? input.authorize(token) : token === `Bearer access-${issued}`, input.handshakeStatus ?? 401);
    },
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const home = await mkdtemp(join(tmpdir(), "exterior-daemon-"));
  await writeSignIn({ relayUrl: origin, accessToken: "access-1", refreshToken: "refresh-1", expiresAt: input.expiresAt ?? Date.now() + 3_600_000 }, home);
  return {
    origin, home, tokens, refreshes, sockets, http,
    async accessToken(forceRefresh: boolean, signal?: AbortSignal) {
      return (await usableSignIn({ relayUrl: origin, homeDirectory: home, forceRefresh, signal })).accessToken;
    },
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
    },
  };
}
