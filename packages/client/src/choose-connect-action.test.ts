import assert from "node:assert/strict";
import test from "node:test";
import { chooseConnectAction } from "./choose-connect-action.js";

const documentationUrl = "https://docs.example/explain";

test("a waiting gateway opens the socket", () => {
  assert.deepEqual(
    chooseConnectAction({
      observation: "waiting",
      elapsedMs: 0,
      readyTimeoutMs: 60_000,
      documentationUrl,
    }),
    { type: "open-socket" },
  );
});

test("an unconfigured type or a cancelled choice stays with the app", () => {
  assert.deepEqual(
    chooseConnectAction({
      observation: "unconfigured",
      elapsedMs: 60_000,
      readyTimeoutMs: 60_000,
      documentationUrl,
    }),
    { type: "unconfigured" },
  );
  assert.deepEqual(
    chooseConnectAction({
      observation: "cancelled",
      elapsedMs: 60_000,
      readyTimeoutMs: 60_000,
      documentationUrl,
    }),
    { type: "cancelled" },
  );
});

test("choosing a local configuration keeps waiting past the ready timeout", () => {
  assert.deepEqual(
    chooseConnectAction({
      observation: "choosing",
      elapsedMs: 60_000,
      readyTimeoutMs: 60_000,
      documentationUrl,
    }),
    { type: "wait" },
  );
});

test("an unreachable gateway uses the explain page only after the wait", () => {
  assert.deepEqual(
    chooseConnectAction({
      observation: "unreachable",
      elapsedMs: 1_000,
      readyTimeoutMs: 60_000,
      documentationUrl,
    }),
    { type: "wait" },
  );
  assert.deepEqual(
    chooseConnectAction({
      observation: "unreachable",
      elapsedMs: 60_000,
      readyTimeoutMs: 60_000,
      documentationUrl,
    }),
    { type: "documentation", url: documentationUrl },
  );
});

test("a rejected status selects the explain page immediately", () => {
  assert.deepEqual(
    chooseConnectAction({
      observation: "rejected",
      elapsedMs: 0,
      readyTimeoutMs: 60_000,
      documentationUrl,
    }),
    { type: "documentation", url: documentationUrl },
  );
});
