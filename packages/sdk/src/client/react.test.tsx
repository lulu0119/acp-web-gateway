// @vitest-environment jsdom
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { act, renderHook, waitFor } from "@testing-library/react";
import { test } from "vitest";
import { useAccount } from "./react.js";

test("a callback under a custom base signs in and returns to the app root", async () => {
  const relay = await fakeTokenRelay();
  try {
    window.sessionStorage.setItem("exterior.codeVerifier", "verifier-1");
    window.sessionStorage.setItem("exterior.state", "state-1");
    const redirectUri = `${relay.origin}/playground/oauth/callback`;
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", "code-1");
    callback.searchParams.set("state", "state-1");
    callback.searchParams.set("iss", `${relay.origin}/api/auth`);
    act(() => {
      window.history.replaceState({}, "", `${callback.pathname}${callback.search}`);
    });
    const { result } = renderHook(() => useAccount(relay.origin, { clientId: "example-client", redirectUri, returnTo: "/playground/" }));
    await waitFor(() => assert.equal(result.current.account.phase, "signed-in"));
    assert.equal(window.location.pathname, "/playground/");
    assert.equal(window.sessionStorage.getItem("exterior.accessToken"), "access-1");
  } finally {
    relay.close();
    window.sessionStorage.clear();
  }
});

test("without a redirect address the callback stays at the root path", async () => {
  const relay = await fakeTokenRelay();
  try {
    window.sessionStorage.setItem("exterior.codeVerifier", "verifier-1");
    window.sessionStorage.setItem("exterior.state", "state-1");
    const callback = new URL("/oauth/callback", window.location.origin);
    callback.searchParams.set("code", "code-1");
    callback.searchParams.set("state", "state-1");
    callback.searchParams.set("iss", `${relay.origin}/api/auth`);
    act(() => {
      window.history.replaceState({}, "", `${callback.pathname}${callback.search}`);
    });
    const { result } = renderHook(() => useAccount(relay.origin, { clientId: "example-client" }));
    await waitFor(() => assert.equal(result.current.account.phase, "signed-in"));
    assert.equal(window.location.pathname, "/");
  } finally {
    relay.close();
    window.sessionStorage.clear();
  }
});

test("an access token about to expire is refreshed once for callers that race", async () => {
  const relay = await fakeTokenRelay();
  try {
    window.sessionStorage.setItem("exterior.accessToken", "access-1");
    window.sessionStorage.setItem("exterior.refreshToken", "refresh-1");
    window.sessionStorage.setItem("exterior.expiresAt", String(Date.now() + 3_600_000));
    const { result } = renderHook(() => useAccount(relay.origin, { clientId: "example-client" }));
    await waitFor(() => assert.equal(result.current.account.phase, "signed-in"));
    assert.equal(await result.current.accessToken(), "access-1");
    window.sessionStorage.setItem("exterior.expiresAt", String(Date.now() + 30_000));
    assert.deepEqual(await Promise.all([result.current.accessToken(), result.current.accessToken()]), ["access-2", "access-2"]);
    assert.equal(relay.refreshes(), 1);
  } finally {
    relay.close();
    window.sessionStorage.clear();
  }
});

test("account operations obtain a live token and share a refresh before listing devices and opening an agent", async () => {
  const relay = await fakeTokenRelay();
  try {
    window.sessionStorage.setItem("exterior.accessToken", "access-1");
    window.sessionStorage.setItem("exterior.refreshToken", "refresh-1");
    window.sessionStorage.setItem("exterior.expiresAt", String(Date.now() + 3_600_000));
    const { result } = renderHook(() => useAccount(relay.origin, { clientId: "example-client" }));
    await waitFor(() => assert.equal(result.current.account.phase, "signed-in"));
    window.sessionStorage.setItem("exterior.expiresAt", String(Date.now() + 30_000));
    const [devices, connection] = await Promise.all([result.current.listDevices(), result.current.openConnection({ deviceId: "studio", agentName: "work" })]);
    assert.deepEqual(devices, []);
    assert.equal(connection.url, "wss://relay.example/attach?ticket=one-use");
    assert.equal(relay.refreshes(), 1);
    assert.deepEqual(relay.requests().sort(), ["/eap/v1/connections Bearer access-2", "/eap/v1/devices Bearer access-2"]);
  } finally {
    relay.close();
    window.sessionStorage.clear();
  }
});

test("a sign-in the relay no longer honors signs the account out when a token is asked for", async () => {
  const relay = await fakeTokenRelay({ refusesRefresh: true });
  try {
    window.sessionStorage.setItem("exterior.accessToken", "access-1");
    window.sessionStorage.setItem("exterior.refreshToken", "refresh-1");
    window.sessionStorage.setItem("exterior.expiresAt", String(Date.now() + 3_600_000));
    const { result } = renderHook(() => useAccount(relay.origin, { clientId: "example-client" }));
    await waitFor(() => assert.equal(result.current.account.phase, "signed-in"));
    window.sessionStorage.setItem("exterior.expiresAt", String(Date.now()));
    await act(() => assert.rejects(result.current.accessToken(), { message: "Sign in again." }));
    assert.equal(result.current.account.phase, "signed-out");
    assert.equal(window.sessionStorage.getItem("exterior.refreshToken"), null);
  } finally {
    relay.close();
    window.sessionStorage.clear();
  }
});

// Discovery, code redemption, token rotation, and authenticated EAP requests.
async function fakeTokenRelay(options: { refusesRefresh?: boolean } = {}): Promise<{ origin: string; close: () => void; refreshes: () => number; requests: () => string[] }> {
  let refreshes = 0;
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
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
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          authorization_response_iss_parameter_supported: true,
          token_endpoint_auth_methods_supported: ["none"],
        });
      }
      if (url.pathname === "/api/auth/oauth2/token") {
        if (new URLSearchParams(Buffer.concat(chunks).toString()).get("grant_type") !== "refresh_token") {
          return json(response, { access_token: "access-1", token_type: "bearer", expires_in: 3600 });
        }
        refreshes += 1;
        if (options.refusesRefresh) return json(response, { error: "invalid_grant" }, 400);
        return json(response, { access_token: "access-2", token_type: "bearer", expires_in: 3600, refresh_token: "refresh-2" });
      }
      if (url.pathname.startsWith("/eap/v1/")) {
        requests.push(`${url.pathname} ${request.headers.authorization}`);
        return json(response, url.pathname.endsWith("/devices") ? { devices: [] } : { url: "wss://relay.example/attach?ticket=one-use" });
      }
      response.writeHead(404);
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The fake relay did not bind.");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close(), refreshes: () => refreshes, requests: () => requests };
}

function json(response: import("node:http").ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
