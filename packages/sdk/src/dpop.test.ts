import assert from "node:assert/strict";
import * as oauth from "oauth4webapi";
import { test } from "vitest";
import { deviceIdOf, dpopProof, exportDeviceKey, generateDeviceKey, importDeviceKey } from "./dpop.js";

test("a device key survives being kept, and its id is the thumbprint every DPoP library computes", async () => {
  const key = await generateDeviceKey();
  const kept = await importDeviceKey(JSON.parse(JSON.stringify(await exportDeviceKey(key))) as JsonWebKey);
  const id = await deviceIdOf(key);
  assert.equal(await deviceIdOf(kept), id);
  assert.equal(await oauth.DPoP({}, kept).calculateThumbprint(), id);
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
});

test("a proof names the request in its http form, binds the access token, and verifies with the key it carries", async () => {
  const key = await generateDeviceKey();
  const proof = await dpopProof(key, "GET", "wss://relay.example/eap/v1/device?x=1", "token-1");
  const [header, claims, signature] = proof.split(".");
  const read = (part: string | undefined) => JSON.parse(Buffer.from(part ?? "", "base64url").toString()) as Record<string, unknown>;
  assert.equal(read(header).typ, "dpop+jwt");
  assert.equal(read(header).alg, "ES256");
  const payload = read(claims);
  assert.equal(payload.htm, "GET");
  assert.equal(payload.htu, "https://relay.example/eap/v1/device");
  assert.equal(payload.ath, Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("token-1"))).toString("base64url"));
  const carried = await crypto.subtle.importKey("jwk", read(header).jwk as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${header}.${claims}`);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, carried, Buffer.from(signature ?? "", "base64url"), signed));
  assert.equal("ath" in read((await dpopProof(key, "GET", "https://relay.example/x")).split(".")[1]), false);
});
