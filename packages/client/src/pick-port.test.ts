import assert from "node:assert/strict";
import test from "node:test";
import { pickFreeGatewayPort } from "./pick-port.js";

test("the first candidate with no answering gateway is picked", async () => {
  const port = await pickFreeGatewayPort({
    candidates: [9001, 9002, 9003],
    readStatus: async (candidate) => (candidate === 9001 ? "waiting" : candidate === 9002 ? "rejected" : "unreachable"),
  });
  assert.equal(port, 9003);
});

test("no free candidate is reported as undefined", async () => {
  const port = await pickFreeGatewayPort({
    candidates: [9001, 9002],
    readStatus: async () => "choosing",
  });
  assert.equal(port, undefined);
});
