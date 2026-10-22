import assert from "node:assert/strict";
import { createServer, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { test } from "vitest";
import { beginDeviceAuthorization, pollDeviceAuthorization } from "../device/authorization.js";
import { generateDeviceKey } from "../dpop.js";
import { revokeRefreshToken } from "../oauth.js";
import {
  beginBrowserSignIn,
  clearBrowserSignIn,
  createAuthorizationRequest,
  finishBrowserSignIn,
  listDevices,
  openConnection,
  type BrowserStore,
} from "./oauth.js";

test("a known client builds an authorization url and exchanges the callback", async () => {
  const relay = await fakeRelay();
  const store = memoryStore();
  try {
    const request = await createAuthorizationRequest({
      relayUrl: relay.origin,
      clientId: "example-client",
      redirectUri: `${relay.origin}/oauth/callback`,
    });
    store.setItem("exterior.codeVerifier", request.codeVerifier);
    store.setItem("exterior.state", request.state);
    const url = new URL(request.url);
    assert.equal(url.origin + url.pathname, `${relay.origin}/api/auth/oauth2/authorize`);
    assert.equal(url.searchParams.get("client_id"), "example-client");
    assert.equal(url.searchParams.get("scope"), "eap:client offline_access");
    assert.equal(url.searchParams.get("resource"), relay.origin);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.equal(url.searchParams.get("state"), request.state);
    const callback = new URL("/oauth/callback", relay.origin);
    callback.searchParams.set("code", "code-1");
    callback.searchParams.set("state", request.state);
    callback.searchParams.set("iss", `${relay.origin}/api/auth`);
    const tokens = await finishBrowserSignIn({
      relayUrl: relay.origin,
      clientId: "example-client",
      redirectUri: `${relay.origin}/oauth/callback`,
      callbackUrl: callback.href,
      store,
    });
    assert.equal(tokens.accessToken, "access-1");
    assert.equal(store.getItem("exterior.accessToken"), "access-1");
    assert.equal(store.getItem("exterior.codeVerifier"), null);
  } finally {
    relay.close();
  }
});

test("device sign-in waits until the code is approved, proving the device key on every poll", async () => {
  const relay = await fakeRelay();
  try {
    const pending = await beginDeviceAuthorization({ relayUrl: relay.origin, clientId: "https://exterior.example/device-client.json" });
    assert.equal(pending.userCode, "ABCD-EFGH");
    const tokens = await pollDeviceAuthorization(pending, await generateDeviceKey());
    assert.equal(tokens.refreshToken, "refresh-1");
    assert.equal(relay.deviceProofs.length, 2);
    assert.ok(relay.deviceProofs.every((proof) => proof.split(".").length === 3));
  } finally {
    relay.close();
  }
});

test("listing devices and opening a connection use the access token", async () => {
  const relay = await fakeRelay();
  try {
    assert.deepEqual(await listDevices(relay.origin, "access-1"), [
      { id: "device-studio-1", hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }], platform: "linux" },
    ]);
    const opened = await openConnection(relay.origin, "access-1", { deviceId: "device-studio-1", agentName: "work" });
    assert.match(opened.url, /ticket=once/);
    await assert.rejects(openConnection(relay.origin, "access-1", { deviceId: "device-studio-1", agentName: "gone" }), {
      name: "RelayError",
      code: "target_not_found",
      status: 404,
    });
  } finally {
    relay.close();
  }
});

test("revoking a refresh token names it as one", async () => {
  const relay = await fakeRelay();
  try {
    await revokeRefreshToken({ relayUrl: relay.origin, clientId: "device-client", refreshToken: "refresh-1" });
    assert.deepEqual(relay.revoked, [{ token: "refresh-1", hint: "refresh_token", clientId: "device-client" }]);
  } finally {
    relay.close();
  }
});

test("a dismissed connection form can cancel device listing and agent opening", async () => {
  const relay = await fakeRelay();
  const signal = AbortSignal.abort();
  try {
    await assert.rejects(listDevices(relay.origin, "access-1", signal), { name: "AbortError" });
    await assert.rejects(openConnection(relay.origin, "access-1", { deviceId: "device-studio-1", agentName: "work" }, signal), { name: "AbortError" });
  } finally {
    relay.close();
  }
});

test("a web app signs in with its metadata document's address", async () => {
  const relay = await fakeRelay();
  const store = memoryStore();
  const clientId = "https://app.example.test/oauth-client.json";
  try {
    const redirectUri = `${relay.origin}/oauth/callback`;
    const url = new URL(await beginBrowserSignIn({ relayUrl: relay.origin, redirectUri, store, clientId }));
    assert.equal(url.searchParams.get("client_id"), clientId);
    assert.equal(url.searchParams.get("scope"), "eap:client offline_access");
    assert.equal(url.searchParams.get("resource"), relay.origin);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(store.getItem("exterior.codeVerifier"));
    assert.ok(store.getItem("exterior.state"));
    const callback = new URL("/oauth/callback", relay.origin);
    callback.searchParams.set("code", "code-1");
    callback.searchParams.set("state", store.getItem("exterior.state") ?? "");
    callback.searchParams.set("iss", `${relay.origin}/api/auth`);
    const tokens = await finishBrowserSignIn({ relayUrl: relay.origin, redirectUri, callbackUrl: callback.href, store, clientId });
    assert.equal(tokens.accessToken, "access-1");
  } finally {
    relay.close();
  }
});

test("signing out clears the stored browser tokens", () => {
  const store = memoryStore();
  store.setItem("exterior.accessToken", "access-1");
  store.setItem("exterior.refreshToken", "refresh-1");
  store.setItem("exterior.expiresAt", String(Date.now() + 3_600_000));
  clearBrowserSignIn(store);
  assert.equal(store.getItem("exterior.accessToken"), null);
  assert.equal(store.getItem("exterior.refreshToken"), null);
  assert.equal(store.getItem("exterior.expiresAt"), null);
});

test("two racing callback exchanges share one code redemption", async () => {
  const relay = await fakeRelay();
  const store = memoryStore();
  const redirectUri = `${relay.origin}/oauth/callback`;
  try {
    store.setItem("exterior.codeVerifier", "verifier-1");
    store.setItem("exterior.state", "state-1");
    const callback = new URL("/oauth/callback", relay.origin);
    callback.searchParams.set("code", "code-1");
    callback.searchParams.set("state", "state-1");
    callback.searchParams.set("iss", `${relay.origin}/api/auth`);
    const input = {
      relayUrl: relay.origin,
      clientId: "example-client",
      redirectUri,
      callbackUrl: callback.href,
      store,
    };
    const [first, second] = await Promise.all([finishBrowserSignIn(input), finishBrowserSignIn(input)]);
    assert.equal(first.accessToken, "access-1");
    assert.equal(second.accessToken, "access-1");
    assert.equal(relay.tokenPosts, 1);
  } finally {
    relay.close();
  }
});

function memoryStore(): BrowserStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

async function fakeRelay(): Promise<{
  origin: string;
  tokenPosts: number;
  revoked: { token: string | null; hint: string | null; clientId: string | null }[];
  /** The DPoP proof of each device code poll. */
  deviceProofs: string[];
  close: () => void;
}> {
  const deviceProofs: string[] = [];
  let devicePolls = 0;
  let tokenPosts = 0;
  const revoked: { token: string | null; hint: string | null; clientId: string | null }[] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      const proof = request.headers.dpop;
      if (typeof proof === "string" && new URLSearchParams(raw).get("grant_type") === "urn:ietf:params:oauth:grant-type:device_code") deviceProofs.push(proof);
      respond(url, new URLSearchParams(raw), raw, response);
    });
  });
  function respond(url: URL, params: URLSearchParams, raw: string, response: ServerResponse): void {
    const address = server.address();
    const port = address && typeof address !== "string" ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    const issuer = `${origin}/api/auth`;
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      return json(response, { resource: origin, authorization_servers: [issuer] });
    }
    if (url.pathname === "/api/auth/.well-known/openid-configuration") {
      return json(response, {
        issuer,
        authorization_endpoint: `${issuer}/oauth2/authorize`,
        token_endpoint: `${issuer}/oauth2/token`,
        revocation_endpoint: `${issuer}/oauth2/revoke`,
        device_authorization_endpoint: `${issuer}/device/code`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
        code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true,
        token_endpoint_auth_methods_supported: ["none"],
      });
    }
    if (url.pathname === "/api/auth/device/code") {
      return json(response, {
        device_code: "device-code-1",
        user_code: "ABCD-EFGH",
        verification_uri: `${origin}/device`,
        expires_in: 30,
        interval: 0.05,
      });
    }
    if (url.pathname === "/api/auth/oauth2/token") {
      tokenPosts += 1;
      if (params.get("grant_type") === "urn:ietf:params:oauth:grant-type:device_code") {
        devicePolls += 1;
        if (devicePolls === 1) return json(response, { error: "authorization_pending", error_description: "wait" }, 400);
      }
      return json(response, { access_token: "access-1", token_type: "bearer", expires_in: 3600, refresh_token: "refresh-1" });
    }
    if (url.pathname === "/api/auth/oauth2/revoke") {
      revoked.push({ token: params.get("token"), hint: params.get("token_type_hint"), clientId: params.get("client_id") });
      response.writeHead(200);
      response.end();
      return;
    }
    if (url.pathname === "/eap/v1/devices") {
      return json(response, { devices: [{ id: "device-studio-1", hostname: "studio", workingDirectory: "/home/ada/work", agents: [{ name: "work", agentType: "opencode" }], platform: "linux" }] });
    }
    if (url.pathname === "/eap/v1/connections") {
      if (JSON.parse(raw).agentName !== "work") return json(response, { code: "target_not_found", message: "That device is not online." }, 404);
      return json(response, { url: `${origin.replace("http", "ws")}/eap/v1/attach?ticket=once` }, 201);
    }
    response.writeHead(404);
    response.end();
  }
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The fake relay did not bind.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    get tokenPosts() {
      return tokenPosts;
    },
    revoked,
    deviceProofs,
    close: () => server.close(),
  };
}

function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
