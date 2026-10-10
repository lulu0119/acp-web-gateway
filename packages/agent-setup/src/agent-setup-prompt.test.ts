import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgentSetupPrompt } from "./agent-setup-prompt.js";
import { registerCommand } from "./gateway-commands.js";
import { shellQuote } from "./shell-quote.js";

test("shellQuote keeps spaces and single quotes inside one shell word", () => {
  assert.equal(shellQuote("/Users/me/My Repo/it's"), "'/Users/me/My Repo/it'\\''s'");
});

test("the prompt changes into the repository with a quoted path and runs register", () => {
  const prompt = buildAgentSetupPrompt("/Users/me/My Repo");

  assert.ok(prompt.includes("cd '/Users/me/My Repo'"));
  assert.ok(prompt.includes(registerCommand));
});
