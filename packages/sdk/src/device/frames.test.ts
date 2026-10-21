import assert from "node:assert/strict";
import { test } from "vitest";
import { consumeAgentChunk, maxPendingAgentChars, webSocketTextToAgentLine } from "./frames.js";

test("a web socket text frame becomes one agent line", () => {
  assert.equal(webSocketTextToAgentLine('{"jsonrpc":"2.0","id":1}'), '{"jsonrpc":"2.0","id":1}\n');
  assert.equal(webSocketTextToAgentLine('{"id":1}\n'), '{"id":1}\n');
});

test("agent stdout becomes one frame per line, including a split chunk", () => {
  const first = consumeAgentChunk("", '{"id":1}\n{"id":');
  assert.deepEqual(first.frames, ['{"id":1}']);
  const second = consumeAgentChunk(first.pending, '2}\r\n');
  assert.deepEqual(second, { pending: "", frames: ['{"id":2}'], overflow: false });
});

test("an unfinished line past the cap is dropped", () => {
  const consumed = consumeAgentChunk("", `{"id":1}\n${"x".repeat(maxPendingAgentChars + 1)}`);
  assert.equal(consumed.overflow, true);
  assert.deepEqual(consumed.frames, ['{"id":1}']);
  assert.equal(consumed.pending, "");
});
