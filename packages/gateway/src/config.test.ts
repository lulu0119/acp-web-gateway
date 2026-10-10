import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  configFilePath,
  defaultConfigText,
  parseGatewayConfig,
  readGatewayConfig,
  writeGatewayConfig,
} from "./config.js";

test("config stores named agents and ignores a leftover agent command", () => {
  assert.deepEqual(parseGatewayConfig({ agentCommand: "opencode acp", port: 1 }), { agents: [] });
  assert.deepEqual(
    parseGatewayConfig({
      agents: [
        { name: "work", agentType: "opencode", env: { OPENCODE_CONFIG: "/tmp/work" } },
        { name: "broken", agentType: "Not A Type" },
        { name: "work", agentType: "opencode", env: {} },
      ],
    }),
    {
      agents: [{ name: "work", agentType: "opencode", env: { OPENCODE_CONFIG: "/tmp/work" } }],
    },
  );
  assert.equal(defaultConfigText().includes("agentCommand"), false);
  assert.equal(defaultConfigText().includes("47321"), false);
});

test("written config can be read back", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-config-"));
  await writeGatewayConfig(
    { agents: [{ name: "personal", agentType: "opencode", env: { PATH_EXTRA: "bin" } }] },
    homeDirectory,
  );
  const text = await readFile(configFilePath(homeDirectory), "utf8");
  assert.equal(text.includes("personal"), true);
  assert.deepEqual(await readGatewayConfig(homeDirectory), {
    agents: [{ name: "personal", agentType: "opencode", env: { PATH_EXTRA: "bin" } }],
  });
});
