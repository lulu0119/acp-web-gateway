import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { test } from "vitest";
import { machinesScope } from "@exterior/contract";
import {
  beginBrowserSignIn,
  beginDeviceAuthorization,
  clearBrowserSignIn,
  createAuthorizationRequest,
  fetchExteriorUser,
  finishBrowserSignIn,
  listMachines,
  openConnection,
  pollDeviceAuthorization,
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
    assert.equal(url.searchParams.get("scope"), machinesScope);
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

test("device sign-in waits until the code is approved", async () => {
  const relay = await fakeRelay();
  try {
    const pending = await beginDeviceAuthorization({ relayUrl: relay.origin, clientId: "daemon-client" });
    assert.equal(pending.userCode, "ABCD-EFGH");
    const tokens = await pollDeviceAuthorization(pending);
    assert.equal(tokens.refreshToken, "refresh-1");
  } finally {
    relay.close();
  }
});

test("machine list and session open use the access token", async () => {
  const relay = await fakeRelay();
  try {
    assert.deepEqual(await listMachines(relay.origin, "access-1"), [
      { id: "machine-1", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] },
    ]);
    const opened = await openConnection(relay.origin, "access-1", { machineId: "machine-1", agentName: "work" });
    assert.equal(opened.agentName, "work");
    assert.match(opened.url, /ticket=once/);
  } finally {
    relay.close();
  }
});

test("a web app without a client id starts approval without one", async () => {
  const relay = await fakeRelay();
  const store = memoryStore();
  try {
    const url = new URL(await beginBrowserSignIn({ relayUrl: relay.origin, redirectUri: `${relay.origin}/oauth/callback`, store }));
    assert.equal(url.searchParams.get("client_id"), "pending-client");
    assert.ok(store.getItem("exterior.codeVerifier"));
    assert.ok(store.getItem("exterior.state"));
    const callback = new URL("/oauth/callback", relay.origin);
    callback.searchParams.set("code", "code-1");
    callback.searchParams.set("state", store.getItem("exterior.state") ?? "");
    callback.searchParams.set("iss", `${relay.origin}/api/auth`);
    callback.searchParams.set("client_id", "pending-client");
    const tokens = await finishBrowserSignIn({
      relayUrl: relay.origin,
      redirectUri: `${relay.origin}/oauth/callback`,
      callbackUrl: callback.href,
      store,
    });
    assert.equal(tokens.accessToken, "access-1");
    assert.equal(store.getItem(`exterior.clientId:${relay.origin}`), "pending-client");
  } finally {
    relay.close();
  }
});

test("the account behind an access token identifies itself", async () => {
  const relay = await fakeRelay();
  try {
    assert.deepEqual(await fetchExteriorUser({ relayUrl: relay.origin, accessToken: "access-1" }), { sub: "user-1" });
  } finally {
    relay.close();
  }
});

test("signing out clears the stored browser tokens", () => {  const store = memoryStore();
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
    // ROOT CAUSE:
    //
    // If the callback mounts twice, two exchanges raced one single-use code
    // and the loser surfaced invalid_grant. The fix shares one redemption
    // between racing callers for the same code.
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

async function fakeRelay(): Promise<{ origin: string; tokenPosts: number; close: () => void }> {
  let devicePolls = 0;
  let tokenPosts = 0;
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const params = new URLSearchParams(Buffer.concat(chunks).toString());
      respond(url, params, response);
    });
  });
    function respond(url: URL, params: URLSearchParams, response: import("node:http").ServerResponse): void {
    const address = server.address();
    const port = address && typeof address !== "string" ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    const issuer = `${origin}/api/auth`;
    if (url.pathname === "/api/auth/.well-known/openid-configuration") {
      return json(response, {
        issuer,
        authorization_endpoint: `${issuer}/oauth2/authorize`,
        token_endpoint: `${issuer}/oauth2/token`,
        device_authorization_endpoint: `${issuer}/device/code`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
        code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true,
        token_endpoint_auth_methods_supported: ["none"],
      });
    }
    if (url.pathname === "/api/clients") return json(response, { daemonClientId: "daemon-client" });
    if (url.pathname === "/api/authorize-request") {
      return json(response, { url: `${origin}/api/auth/oauth2/authorize?client_id=pending-client` });
    }
    if (url.pathname === "/api/auth/oauth2/userinfo") return json(response, { sub: "user-1" });
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
    if (url.pathname === "/api/machines") {
      return json(response, { machines: [{ id: "machine-1", hostname: "studio", agents: [{ name: "work", agentType: "opencode" }] }] });
    }
    if (url.pathname === "/api/sessions") {
      return json(response, { url: `${origin.replace("http", "ws")}/api/acp?ticket=once`, agentType: "opencode", agentName: "work" });
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
    close: () => server.close(),
  };
}

function json(response: import("node:http").ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
