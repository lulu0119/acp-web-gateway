import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCliArgs, parseRelayUrl, runCli } from "./run-cli.js";

test("sign-in commands, daemon, and agent-config dispatch, anything else fails", async () => {
  const calls: string[] = [];
  assert.deepEqual(await runCli(["login"], actions(calls)), { exitCode: 0, showUsage: false });
  assert.deepEqual(await runCli(["logout", "--relay", "mukae.example"], actions(calls)), { exitCode: 0, showUsage: false });
  assert.deepEqual(await runCli(["status"], actions(calls)), { exitCode: 0, showUsage: false });
  assert.deepEqual(await runCli(["daemon", "--relay", "https://mukae.example"], actions(calls)), { exitCode: 0, showUsage: false });
  assert.deepEqual(await runCli(["agent-config", "list"], actions(calls)), { exitCode: 0, showUsage: false });
  assert.deepEqual(await runCli(["agent-config", "types"], actions(calls)), { exitCode: 0, showUsage: false });
  assert.deepEqual(
    await runCli(
      ["agent-config", "create", "--agent-type", "opencode", "--name", "work", "--env", "OPENCODE_CONFIG=/tmp/work"],
      actions(calls),
    ),
    { exitCode: 0, showUsage: false },
  );
  assert.deepEqual(await runCli(["nope"], actions(calls)), { exitCode: 1, showUsage: true });
  assert.deepEqual(await runCli(["agent-config", "create"], actions(calls)), { exitCode: 1, showUsage: true });
  assert.deepEqual(await runCli(["status", "--relay", "mukae.example"], actions(calls)), { exitCode: 1, showUsage: true });
  assert.deepEqual(calls, ["login undefined", "logout https://mukae.example", "status", "daemon https://mukae.example", "list", "types", "create opencode work OPENCODE_CONFIG=/tmp/work"]);
});

test("create accepts a repeated environment flag and rejects a broken one", () => {
  assert.deepEqual(parseCliArgs(["agent-config", "create", "--agent-type", "opencode", "--env", "A=1", "--env", "B=2"]), {
    kind: "create-agent-config",
    agentType: "opencode",
    command: undefined,
    name: undefined,
    env: { A: "1", B: "2" },
  });
  assert.deepEqual(parseCliArgs(["agent-config", "create", "--command", "npx -y pkg --stdio", "--name", "mine"]), {
    kind: "create-agent-config",
    agentType: undefined,
    command: "npx -y pkg --stdio",
    name: "mine",
    env: {},
  });
  assert.equal(parseCliArgs(["agent-config", "create", "--agent-type", "opencode", "--command", "opencode acp"]).kind, "invalid");
  assert.equal(parseCliArgs(["agent-config", "create", "--agent-type", "opencode", "--env", "nope"]).kind, "invalid");
  assert.equal(parseCliArgs(["daemon", "--relay", "notaurl"]).kind, "invalid");
});

test("a relay address may leave out the scheme", () => {
  assert.equal(parseRelayUrl("relay.apps.example.win"), "https://relay.apps.example.win");
  assert.equal(parseRelayUrl("127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(parseRelayUrl("localhost:8787"), "http://localhost:8787");
  assert.equal(parseRelayUrl("http://mukae.example/path"), "http://mukae.example");
  assert.equal(parseRelayUrl("ftp://mukae.example"), undefined);
  assert.equal(parseRelayUrl("--name"), undefined);
});

function actions(calls: string[]) {
  return {
    login: async (relayUrl?: string) => {
      calls.push(`login ${relayUrl}`);
      return 0;
    },
    logout: async (relayUrl?: string) => {
      calls.push(`logout ${relayUrl}`);
      return 0;
    },
    daemon: async (relayUrl?: string) => {
      calls.push(`daemon ${relayUrl}`);
      return 0;
    },
    status: async () => {
      calls.push("status");
      return 0;
    },
    listAgentConfigs: async () => {
      calls.push("list");
      return 0;
    },
    listAgentTypes: async () => {
      calls.push("types");
      return 0;
    },
    createAgentConfig: async (input: { agentType?: string; command?: string; name?: string; env: Record<string, string> }) => {
      const envText = Object.entries(input.env)
        .map(([key, value]) => `${key}=${value}`)
        .join(",");
      calls.push(`create ${input.agentType} ${input.name ?? ""} ${envText}`.trim());
      return 0;
    },
  };
}
