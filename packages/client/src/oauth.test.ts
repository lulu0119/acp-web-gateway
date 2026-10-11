import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { machinesScope } from "@mukae/contract";
import {
  beginBrowserSignIn,
  beginDeviceAuthorization,
  finishBrowserSignIn,
  listMachines,
  openConnection,
  pollDeviceAuthorization,
  type BrowserStore,
} from "./oauth.js";

test("a browser sign-in keeps the code verifier and exchanges the callback", async () => {
  const relay = await fakeRelay();
  const store = memoryStore();
  try {
    const url = new URL(await beginBrowserSignIn({ relayUrl: relay.origin, redirectUri: `${relay.origin}/oauth/callback`, store }));
    assert.equal(url.origin + url.pathname, `${relay.origin}/api/auth/oauth2/authorize`);
    assert.equal(url.searchParams.get("client_id"), "example-client");
    assert.equal(url.searchParams.get("scope"), machinesScope);
    assert.equal(url.searchParams.get("resource"), relay.origin);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    const state = store.getItem("mukae.state");
    assert.equal(url.searchParams.get("state"), state);
    const callback = new URL("/oauth/callback", relay.origin);
    callback.searchParams.set("code", "code-1");
    callback.searchParams.set("state", state ?? "");
    callback.searchParams.set("iss", `${relay.origin}/api/auth`);
    const tokens = await finishBrowserSignIn({
      relayUrl: relay.origin,
      redirectUri: `${relay.origin}/oauth/callback`,
      callbackUrl: callback.href,
      store,
    });
    assert.equal(tokens.accessToken, "access-1");
    assert.equal(store.getItem("mukae.accessToken"), "access-1");
    assert.equal(store.getItem("mukae.codeVerifier"), null);
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

function memoryStore(): BrowserStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

async function fakeRelay(): Promise<{ origin: string; close: () => void }> {
  let devicePolls = 0;
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
    if (url.pathname === "/api/clients") return json(response, { exampleClientId: "example-client", daemonClientId: "daemon-client" });
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
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

function json(response: import("node:http").ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
