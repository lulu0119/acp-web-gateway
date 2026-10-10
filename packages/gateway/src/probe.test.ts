import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { knownAgentTypes } from "./agents.js";
import { firstInitializeLine, interpretInitializeLine, planAgentConfigurations, probeInstalledAgent } from "./probe.js";

test("an initialize response is ready when the protocol matches and no sign-in is offered", () => {
  const ready = interpretInitializeLine(
    '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"authMethods":[]}}',
  );
  assert.deepEqual(ready, { ok: true, needsSignIn: false, methods: [] });
  const signIn = interpretInitializeLine(
    '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"authMethods":[{"id":"oauth","name":"Google"}]}}',
  );
  assert.deepEqual(signIn, { ok: true, needsSignIn: true, methods: ["Google"] });
  assert.equal(interpretInitializeLine("not json").ok, false);
  assert.equal(
    interpretInitializeLine('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":2}}').ok,
    false,
  );
});

test("the handshake reader skips banners and keeps the first JSON line", () => {
  const line = firstInitializeLine('banner\n{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}\ntrailing');
  assert.equal(line, '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}');
});

test("a handshake that returns protocol version 1 is ready", async () => {
  const root = await mkdtemp(join(tmpdir(), "mukae-probe-"));
  const binary = join(root, "opencode");
  await writeFile(binary, "#!/bin/sh\nprintf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":1}}'\n");
  await chmod(binary, 0o755);
  const outcome = await probeInstalledAgent("opencode", root, 5_000);
  assert.deepEqual(outcome, { status: "ready" });
});

test("a handshake stays open until the agent answers", async () => {
  const root = await mkdtemp(join(tmpdir(), "mukae-probe-"));
  const script = join(root, "answer.js");
  const binary = join(root, "opencode");
  await writeFile(
    script,
    `let ended = false;
process.stdin.on("end", () => {
  ended = true;
  process.exit(0);
});
process.stdin.resume();
setTimeout(() => {
  if (ended) return;
  process.stdout.write('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"authMethods":[{"name":"Login with opencode"}]}}\\n');
}, 100);
`,
  );
  await writeFile(binary, `#!/bin/sh\nexec '${process.execPath}' '${script}'\n`);
  await chmod(binary, 0o755);
  const outcome = await probeInstalledAgent("opencode", root, 5_000);
  assert.deepEqual(outcome, { status: "sign-in", methods: ["Login with opencode"] });
});

test("a missing agent command is reported without starting a process", async () => {
  const outcome = await probeInstalledAgent("opencode", "/missing");
  assert.deepEqual(outcome, { status: "missing", command: "opencode" });
});

test("probe results keep an existing configuration and write only a ready agent", () => {
  const planned = planAgentConfigurations({
    agents: [{ name: "codex-acp", agentType: "codex-acp", env: {} }],
    knownTypes: knownAgentTypes(),
    probes: [
      { agentType: "codex-acp", outcome: { status: "already" } },
      { agentType: "opencode", outcome: { status: "ready" } },
      { agentType: "gemini", outcome: { status: "sign-in", methods: ["Google"] } },
      { agentType: "claude-acp", outcome: { status: "missing", command: "claude" } },
    ],
  });
  assert.deepEqual(
    planned.agents.map((agent) => agent.name),
    ["codex-acp", "opencode", "gemini"],
  );
  assert.equal(planned.needsSignIn, true);
  assert.deepEqual(planned.lines, [
    "codex-acp: already configured",
    "opencode: configured",
    "gemini: configured; sign-in available (Google)",
    "claude-acp: not installed (claude)",
  ]);
});
