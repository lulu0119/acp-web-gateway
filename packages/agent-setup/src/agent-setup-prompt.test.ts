import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgentSetupPrompt } from "./agent-setup-prompt.js";
import { installCommand, listAgentConfigsCommand } from "./gateway-commands.js";
import { shellQuote } from "./shell-quote.js";

test("shellQuote keeps spaces and single quotes inside one shell word", () => {
  assert.equal(shellQuote("/Users/me/My Repo/it's"), "'/Users/me/My Repo/it'\\''s'");
});

test("the prompt installs the preview package and checks the configurations", () => {
  const prompt = buildAgentSetupPrompt();
  assert.ok(prompt.includes(installCommand));
  assert.ok(prompt.includes(listAgentConfigsCommand));
  assert.ok(prompt.includes("~/Library/Application Support/mukae"));
});
