import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { deviceCloseCodes } from "@exterioragentprotocol/sdk";
import { generateDeviceKey } from "@exterioragentprotocol/sdk/device";
import { deviceKeyFor } from "./device-keys.js";
import type { GatewayConfig } from "./config.js";
import { runDaemon } from "./daemon.js";
import { usableSignIn } from "./login.js";
import { readSignIn, writeSignIn } from "./sign-ins.js";

const workingDirectory = join(tmpdir(), "exterior-daemon-workspace");
const deviceKey = await generateDeviceKey();

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
    deviceKey,
    relayUrl: `http://127.0.0.1:${address.port}`,
    getAccessToken: async () => "token-1",
    inform: () => undefined,
    hostname: "studio", config: { agents: [{ name: "work", agentType: "opencode", env: {} }], workingDirectory },
    signal: controller.signal,
    catalog: [{ id: "opencode", name: "OpenCode", binary: { "darwin-aarch64": { cmd: "./opencode", args: ["acp"], env: {} } } }],
  });
  try {
    const message = await seen;
    assert.match(message, /DPoP token-1/);
    assert.match(message, /"type":"hello"/);
    assert.match(message, /studio/);
    assert.equal(JSON.parse(message.slice(message.indexOf("{"))).workingDirectory, workingDirectory);
  } finally {
    controller.abort();
    server.close();
    await running;
  }
});

test("a changed configuration says hello again on the open connection and on the next one", async () => {
  const relay = await daemonRelay();
  const controller = new AbortController();
  const hellos: { agents: { name: string }[]; workingDirectory: string }[] = [];
  let push: ((config: GatewayConfig & { workingDirectory: string }) => void) | undefined;
  let unsubscribed = false;
  const said = (count: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Saw ${hellos.length} hellos.`)), 3_000);
      const check = setInterval(() => {
        if (hellos.length < count) return;
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }, 10);
    });
  relay.sockets.on("connection", (socket) => {
    socket.on("message", (data) => hellos.push(JSON.parse(data.toString())));
  });
  const running = runDaemon({
    deviceKey,
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: () => undefined,
    hostname: "studio", config: { agents: [], workingDirectory },
    configUpdates(listener) {
      push = listener;
      return () => (unsubscribed = true);
    },
    catalog: [],
    signal: controller.signal,
  });
  try {
    await said(1);
    // A custom command that exists everywhere the tests run, so hello lists it.
    push?.({ agents: [{ name: "work", agentType: "custom", env: {}, command: process.execPath }], workingDirectory });
    await said(2);
    // A person who chooses a directory reaches the relay without a new connection.
    const chosen = join(tmpdir(), "exterior-chosen-workspace");
    push?.({ agents: [{ name: "work", agentType: "custom", env: {}, command: process.execPath }], workingDirectory: chosen });
    await said(3);
    for (const socket of relay.sockets.clients) socket.terminate();
    await said(4);
    assert.deepEqual(hellos.map((hello) => hello.agents.map((agent) => agent.name)), [[], ["work"], ["work"], ["work"]]);
    assert.deepEqual(hellos.map((hello) => hello.workingDirectory), [workingDirectory, workingDirectory, chosen, chosen]);
  } finally {
    controller.abort();
    await running;
    await relay.close();
  }
  assert.equal(unsubscribed, true);
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
    deviceKey,
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", config: { agents: [], workingDirectory },
    signal: controller.signal,
    catalog: [],
  });
  try {
    await reconnected;
    assert.deepEqual(relay.tokens, ["DPoP access-1", "DPoP access-2", "DPoP access-3"]);
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
  const relay = await daemonRelay({ authorize: (token) => token === "DPoP access-2" });
  const controller = new AbortController();
  const lines: string[] = [];
  const hello = nextHello(relay.sockets);
  const running = runDaemon({
    deviceKey,
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", config: { agents: [], workingDirectory }, catalog: [], signal: controller.signal,
  });
  try {
    await hello;
    assert.deepEqual(relay.tokens, ["DPoP access-1", "DPoP access-2"]);
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
      deviceKey,
      relayUrl: relay.origin,
      getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
      inform: () => undefined,
      hostname: "studio", config: { agents: [], workingDirectory }, catalog: [],
      signal: AbortSignal.timeout(2_000),
    }), /Relay rejected the refreshed access token. Run exterior login --relay http:\/\/127\.0\.0\.1:\d+ again\./);
    assert.deepEqual(relay.tokens, ["DPoP access-1", "DPoP access-2"]);
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
      deviceKey,
      relayUrl: relay.origin,
      getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
      inform: () => undefined,
      hostname: "studio", config: { agents: [], workingDirectory }, catalog: [],
      signal: AbortSignal.timeout(2_000),
    }), /Run exterior login --relay http:\/\/127\.0\.0\.1:\d+ again\./);
    assert.deepEqual(relay.tokens, ["DPoP access-1"]);
    assert.deepEqual(relay.refreshes, ["refresh-1"]);
    assert.equal((await readSignIn(relay.origin, relay.home))?.refreshToken, "refresh-1");
  } finally {
    await relay.close();
  }
});

test("refresh without a replacement refresh token keeps the previous one", async () => {
  const relay = await daemonRelay({
    authorize: (token) => token === "DPoP access-2",
    expiresAt: 0,
    refreshResponses: [{ status: 200, body: { access_token: "access-2", token_type: "bearer", expires_in: 3600 } }],
  });
  const controller = new AbortController();
  const hello = nextHello(relay.sockets);
  const running = runDaemon({
    deviceKey,
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: () => undefined,
    hostname: "studio", config: { agents: [], workingDirectory }, catalog: [], signal: controller.signal,
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
    authorize: (token) => token !== "DPoP access-1",
    expiresAt: Date.now() + (forced ? 3_600_000 : 30_000),
    refreshResponses: [{ status: 503, body: { error: "temporarily_unavailable" } }],
  });
  const controller = new AbortController();
  const lines: string[] = [];
  const hello = nextHello(relay.sockets);
  const running = runDaemon({
    deviceKey,
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", config: { agents: [], workingDirectory }, catalog: [], signal: controller.signal,
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

// A 403 means the token was issued to another client, so refreshing it cannot help.
test("HTTP 403 on the daemon socket requires a new sign-in instead of a refresh", async () => {
  const relay = await daemonRelay({ authorize: () => false, handshakeStatus: 403 });
  try {
    await assert.rejects(runDaemon({
      deviceKey,
      relayUrl: relay.origin,
      getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
      inform: () => undefined,
      hostname: "studio", config: { agents: [], workingDirectory }, catalog: [],
      signal: AbortSignal.timeout(2_000),
    }), /Relay rejected this device \(HTTP 403\)\. Run exterior login --relay http:\/\/127\.0\.0\.1:\d+ again\./);
    assert.deepEqual(relay.refreshes, []);
  } finally {
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
    deviceKey,
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: (line) => lines.push(line),
    hostname: "studio", config: { agents: [], workingDirectory }, catalog: [], signal: controller.signal,
  });
  try {
    await hello;
    assert.deepEqual(relay.tokens, ["DPoP access-1", "DPoP access-1"]);
    assert.deepEqual(relay.refreshes, []);
    assert.ok(lines.includes("Relay handshake failed (HTTP 503)."));
    assert.ok(lines.includes("Retrying in 1s."));
  } finally {
    controller.abort();
    await running;
    await relay.close();
  }
});

test("a relay that stops answering pings is left, and the daemon connects again", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1", autoPong: false });
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  let connections = 0;
  const reconnected = new Promise<void>((resolve) => server.on("connection", () => ++connections === 2 && resolve()));
  const lines: string[] = [];
  const controller = new AbortController();
  const running = runDaemon({
    deviceKey,
    relayUrl: `http://127.0.0.1:${address.port}`,
    getAccessToken: async () => "token-1",
    inform: (line) => lines.push(line),
    hostname: "studio", config: { agents: [], workingDirectory }, catalog: [], signal: controller.signal,
    heartbeatMs: 50,
  });
  try {
    await reconnected;
    assert.ok(lines.includes("The relay stopped answering."));
  } finally {
    controller.abort();
    server.close();
    await running;
  }
});

test("a connection the relay replaced waits the longest before connecting again", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  server.on("connection", (socket) => socket.once("message", () => socket.close(deviceCloseCodes.replaced, "replaced")));
  const lines: string[] = [];
  const waiting = new Promise<void>((resolve) => {
    const check = setInterval(() => lines.includes("Retrying in 30s.") && (clearInterval(check), resolve()), 10);
  });
  const controller = new AbortController();
  const running = runDaemon({
    deviceKey,
    relayUrl: `http://127.0.0.1:${address.port}`,
    getAccessToken: async () => "token-1",
    inform: (line) => lines.push(line),
    hostname: "studio", config: { agents: [], workingDirectory }, catalog: [], signal: controller.signal,
  });
  try {
    await waiting;
    assert.ok(lines.some((line) => line.startsWith("A newer connection with this device's sign-in took its place")));
  } finally {
    controller.abort();
    server.close();
    await running;
  }
});

test("a removed device stops and asks to sign in again", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  server.on("connection", (socket) => socket.once("message", () => socket.close(deviceCloseCodes.revoked, "revoked")));
  try {
    await assert.rejects(
      runDaemon({
        deviceKey,
        relayUrl: `http://127.0.0.1:${address.port}`,
        getAccessToken: async () => "token-1",
        inform: () => undefined,
        hostname: "studio", config: { agents: [], workingDirectory }, catalog: [],
      }),
      /This device was removed from the account on the relay\. Run exterior login --relay http:\/\/127\.0\.0\.1:\d+ again\./,
    );
  } finally {
    server.close();
  }
});

test("an agent keeps running while the device socket reconnects, and stopping the daemon stops it", async () => {
  const relay = await daemonRelay();
  const controller = new AbortController();
  const echo = { name: "echo", agentType: "custom", env: {}, command: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"] };
  const agentSockets: WebSocket[] = [];
  let controls = 0;
  relay.sockets.on("connection", (socket, request) => {
    if (request.url?.startsWith("/eap/v1/device/connections/")) {
      agentSockets.push(socket);
      return;
    }
    controls += 1;
    if (controls === 1) socket.once("message", () => socket.send(JSON.stringify({ type: "open", connectionId: "connection-1-aaaaaaaaaaa", agentName: "echo" })));
  });
  const running = runDaemon({
    deviceKey,
    relayUrl: relay.origin,
    getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
    inform: () => undefined,
    hostname: "studio", config: { agents: [echo], workingDirectory }, catalog: [], signal: controller.signal,
  });
  try {
    await waitFor(() => agentSockets.length === 1);
    const [agent] = agentSockets;
    assert.ok(agent, "expected an agent socket");
    for (const socket of relay.sockets.clients) if (socket !== agent) socket.terminate();
    await waitFor(() => controls === 2);
    agent.send('{"id":1}');
    const [answer] = (await once(agent, "message")) as [Buffer];
    assert.equal(answer.toString(), '{"id":1}');
    const closed = once(agent, "close");
    controller.abort();
    const [code] = (await closed) as [number];
    assert.equal(code, 1001);
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
      deviceKey,
      relayUrl: relay.origin,
      getAccessToken: (forceRefresh, signal) => relay.accessToken(forceRefresh, signal),
      inform: () => undefined,
      hostname: "studio", config: { agents: [], workingDirectory }, catalog: [], signal: controller.signal,
    });
    assert.ok(controller.signal.aborted);
    assert.deepEqual(relay.tokens, []);
  } finally {
    await relay.close();
  }
});

async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 300 && !condition(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(condition());
}

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
    if (request.url === "/.well-known/oauth-protected-resource") return json({ resource: origin, authorization_servers: [`${origin}/api/auth`] });
    if (request.url === "/api/auth/.well-known/openid-configuration") {
      return json({ issuer: `${origin}/api/auth`, token_endpoint: `${origin}/api/auth/oauth2/token` });
    }
    if (request.url === "/api/auth/oauth2/token") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const params = new URLSearchParams(Buffer.concat(chunks).toString());
        assert.equal(params.get("grant_type"), "refresh_token");
        assert.equal(params.get("client_id"), "device-studio-1");
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
      // An agent socket carries no token: its connection id is the credential.
      if (info.req.url?.startsWith("/eap/v1/device/connections/")) return done(true);
      const token = info.req.headers.authorization ?? "";
      tokens.push(token);
      done(input.authorize ? input.authorize(token) : token === `DPoP access-${issued}`, input.handshakeStatus ?? 401);
    },
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const home = await mkdtemp(join(tmpdir(), "exterior-daemon-"));
  await deviceKeyFor(origin, home);
  await writeSignIn({ relayUrl: origin, clientId: "device-studio-1", accessToken: "access-1", refreshToken: "refresh-1", expiresAt: input.expiresAt ?? Date.now() + 3_600_000 }, home);
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
