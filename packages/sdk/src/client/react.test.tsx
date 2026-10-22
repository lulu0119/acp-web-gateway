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
    window.sessionStorage.setItem("exterior.signInClientId", "example-client");
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
    window.sessionStorage.setItem("exterior.signInClientId", "example-client");
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

// Discovery plus one code redemption, nothing else.
async function fakeTokenRelay(): Promise<{ origin: string; close: () => void }> {
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
          grant_types_supported: ["authorization_code"],
          code_challenge_methods_supported: ["S256"],
          authorization_response_iss_parameter_supported: true,
          token_endpoint_auth_methods_supported: ["none"],
        });
      }
      if (url.pathname === "/api/auth/oauth2/token") {
        return json(response, { access_token: "access-1", token_type: "bearer", expires_in: 3600 });
      }
      response.writeHead(404);
      response.end();
    });
  });
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
