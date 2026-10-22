import assert from "node:assert/strict";
import { test } from "vitest";
import { publicRequest } from "./http.js";

test("a request already at the public origin is kept as it is", async () => {
  const request = new Request("https://relay.example.test/api/auth/oauth2/token", { method: "POST", body: "grant_type=x" });
  assert.equal(publicRequest(request, "https://relay.example.test"), request);
});

test("a proxy's plain-HTTP address is lifted to the public origin, keeping the rest", async () => {
  const request = new Request("http://10.0.0.9:8787/api/auth/oauth2/token?vat=0", {
    method: "POST",
    headers: { dpop: "proof", "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=device_code",
  });
  const addressed = publicRequest(request, "https://relay.example.test");
  assert.equal(addressed.url, "https://relay.example.test/api/auth/oauth2/token?vat=0");
  assert.equal(addressed.method, "POST");
  assert.equal(addressed.headers.get("dpop"), "proof");
  assert.equal(await addressed.text(), "grant_type=device_code");
});
