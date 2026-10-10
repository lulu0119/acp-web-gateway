import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs, runCli } from "./run-cli.js";

test("register, open, and agent-config dispatch, anything else fails", async () => {
  const calls: string[] = [];
  assert.deepEqual(
    await runCli(["register"], actions(calls)),
    { exitCode: 0, showUsage: false },
  );
  assert.deepEqual(
    await runCli(["open", "mukae://connect?nonce=nonce-1234&origin=https%3A%2F%2Fapp.example"], actions(calls)),
    { exitCode: 0, showUsage: false },
  );
  assert.deepEqual(await runCli(["agent-config", "list"], actions(calls)), { exitCode: 0, showUsage: false });
  assert.deepEqual(
    await runCli(
      ["agent-config", "create", "--agent-type", "opencode", "--name", "work", "--env", "OPENCODE_CONFIG=/tmp/work"],
      actions(calls),
    ),
    { exitCode: 0, showUsage: false },
  );
  assert.deepEqual(await runCli([], actions(calls)), { exitCode: 1, showUsage: true });
  assert.deepEqual(await runCli(["agent-config", "create"], actions(calls)), { exitCode: 1, showUsage: true });
  assert.deepEqual(calls, [
    "register",
    "mukae://connect?nonce=nonce-1234&origin=https%3A%2F%2Fapp.example",
    "list",
    "create opencode work OPENCODE_CONFIG=/tmp/work",
  ]);
});

test("create accepts a repeated environment flag and rejects a broken one", () => {
  assert.deepEqual(parseCliArgs(["agent-config", "create", "--agent-type", "opencode", "--env", "A=1", "--env", "B=2"]), {
    kind: "create-agent-config",
    agentType: "opencode",
    name: undefined,
    env: { A: "1", B: "2" },
  });
  assert.equal(parseCliArgs(["agent-config", "create", "--agent-type", "opencode", "--env", "nope"]).kind, "invalid");
});

function actions(calls: string[]) {
  return {
    register: async () => {
      calls.push("register");
    },
    open: async (launchUrl: string) => {
      calls.push(launchUrl);
    },
    listAgentConfigs: async () => {
      calls.push("list");
      return 0;
    },
    createAgentConfig: async (input: { agentType: string; name?: string; env: Record<string, string> }) => {
      const envText = Object.entries(input.env)
        .map(([key, value]) => `${key}=${value}`)
        .join(",");
      calls.push(`create ${input.agentType} ${input.name ?? ""} ${envText}`.trim());
      return 0;
    },
  };
}
