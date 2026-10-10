import assert from "node:assert/strict";
import test from "node:test";
import { admitConnection, statusForOrigin } from "./gate.js";

test("admission requires both the launch nonce and the launch origin", () => {
  const expected = {
    expectedNonce: "nonce-1234",
    expectedOrigin: "https://app.example",
  };
  assert.deepEqual(
    admitConnection({ ...expected, nonce: "nonce-1234", origin: "https://app.example" }),
    { accept: true },
  );
  assert.deepEqual(
    admitConnection({ ...expected, nonce: "other-nonce", origin: "https://app.example" }),
    { accept: false },
  );
  assert.deepEqual(
    admitConnection({ ...expected, nonce: "nonce-1234", origin: "https://other.example" }),
    { accept: false },
  );
  assert.deepEqual(admitConnection({ ...expected, nonce: null, origin: null }), { accept: false });
});

test("status is visible only to the launch origin", () => {
  assert.equal(
    statusForOrigin({
      expectedOrigin: "https://app.example",
      origin: "https://app.example",
      gatewayStatus: "waiting",
    }),
    "waiting",
  );
  assert.equal(
    statusForOrigin({
      expectedOrigin: "https://app.example",
      origin: "https://other.example",
      gatewayStatus: "waiting",
    }),
    "rejected",
  );
  assert.equal(
    statusForOrigin({
      expectedOrigin: "https://app.example",
      origin: "https://app.example",
      gatewayStatus: "unconfigured",
    }),
    "unconfigured",
  );
});
