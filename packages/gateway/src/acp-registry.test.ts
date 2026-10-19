import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
  formatRegistryAgents,
  launchForEntry,
  loadAcpRegistry,
  parseRegistryAgents,
  platformTarget,
  resolveStoredAgent,
} from "./acp-registry.js";
import { resolveCommand, type Executable } from "./launch.js";

const registryText = JSON.stringify({
  version: "1.0.0",
  agents: [
    { id: "", name: "Missing" },
    {
      id: "claude-acp",
      name: "Claude Agent",
      icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg",
      distribution: {
        npx: { package: "@agentclientprotocol/claude-agent-acp@0.89.1" },
        binary: { "darwin-aarch64": { cmd: "./claude", args: ["acp"] } },
      },
    },
    {
      id: "fast-agent",
      name: "Fast Agent",
      distribution: {
        uvx: { package: "fast-agent-acp==0.10.1", args: ["-x"], env: { FAST_AGENT_MODEL: "codexplan" } },
      },
    },
    {
      id: "opencode",
      name: "OpenCode",
      icon: "http://cdn.agentclientprotocol.com/opencode.svg",
      distribution: {
        binary: {
          "darwin-aarch64": { cmd: "./opencode", args: ["acp"], env: { OPENCODE_CONFIG: "registry" } },
          "windows-x86_64": { cmd: ".\\dist\\opencode.exe", args: ["acp"] },
        },
      },
    },
    {
      id: "cursor",
      name: "Cursor",
      distribution: { binary: { "linux-x86_64": { cmd: "./dist-package/cursor-agent", args: ["acp"] } } },
    },
  ],
});

test("registry entries prefer npx, then uvx, then a binary command already on PATH", () => {
  const agents = parseRegistryAgents(registryText);
  assert.ok(agents);
  const claude = agents.find((agent) => agent.id === "claude-acp");
  const fast = agents.find((agent) => agent.id === "fast-agent");
  const opencode = agents.find((agent) => agent.id === "opencode");
  const cursor = agents.find((agent) => agent.id === "cursor");
  assert.ok(claude && fast && opencode && cursor);

  assert.deepEqual(launchForEntry({ entry: claude, platform: "darwin-aarch64", resolve: installs("npx"), userEnv: { KEY: "person" } }), {
    ok: true,
    launch: { executable: image("npx"), args: ["-y", "@agentclientprotocol/claude-agent-acp@0.89.1"], env: { KEY: "person" } },
  });
  assert.deepEqual(
    launchForEntry({ entry: fast, platform: "darwin-aarch64", resolve: installs("uvx"), userEnv: { FAST_AGENT_MODEL: "other" } }),
    { ok: true, launch: { executable: image("uvx"), args: ["fast-agent-acp==0.10.1", "-x"], env: { FAST_AGENT_MODEL: "other" } } },
  );
  assert.deepEqual(launchForEntry({ entry: opencode, platform: "darwin-aarch64", resolve: installs("opencode") }), {
    ok: true,
    launch: { executable: image("opencode"), args: ["acp"], env: { OPENCODE_CONFIG: "registry" } },
  });
  // The archive holds opencode.exe; the npm install answers to opencode with a .cmd shim.
  assert.deepEqual(launchForEntry({ entry: opencode, platform: "windows-x86_64", resolve: installs("opencode") }), {
    ok: true,
    launch: { executable: image("opencode"), args: ["acp"], env: {} },
  });
  assert.deepEqual(launchForEntry({ entry: opencode, platform: "darwin-aarch64", resolve: () => undefined }), {
    ok: false,
    message: '"opencode" is not installed.',
  });
  assert.deepEqual(launchForEntry({ entry: claude, platform: "darwin-aarch64", resolve: () => undefined }), {
    ok: false,
    message: '"npx" is not installed.',
  });
  assert.deepEqual(launchForEntry({ entry: cursor, platform: "darwin-aarch64", resolve: installs("cursor") }), {
    ok: false,
    message: 'Agent type "cursor" has no build for this platform.',
  });
  assert.equal(agents.some((agent) => agent.id === ""), false);
  assert.equal(claude.icon, "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg");
  assert.equal(opencode.icon, undefined);
  assert.equal(formatRegistryAgents(agents).split("\n")[0], "claude-acp\tClaude Agent");
});

test("a stored configuration uses its command, or the registry entry", () => {
  const agents = parseRegistryAgents(registryText) ?? [];
  assert.deepEqual(
    resolveStoredAgent({
      agent: { name: "mine", agentType: "custom", env: { A: "1" }, command: "my-agent", args: ["--stdio"] },
      agents,
      platform: "darwin-aarch64",
      resolve: installs("my-agent"),
    }),
    { executable: image("my-agent"), args: ["--stdio"], env: { A: "1" } },
  );
  // A custom command the person uninstalled is left out of hello.
  assert.equal(
    resolveStoredAgent({
      agent: { name: "mine", agentType: "custom", env: {}, command: "my-agent" },
      agents,
      platform: "darwin-aarch64",
      resolve: () => undefined,
    }),
    undefined,
  );
  assert.equal(
    resolveStoredAgent({
      agent: { name: "work", agentType: "opencode", env: {} },
      agents,
      platform: "darwin-aarch64",
      resolve: () => undefined,
    }),
    undefined,
  );
});

function image(name: string): Executable {
  return { kind: "image", path: join("/installed", name) };
}

function installs(...commands: string[]): (command: string) => Executable | undefined {
  return (command) => (commands.includes(command) ? image(command) : undefined);
}

test("PATH lookup answers with the file this machine would start", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exterior-path-"));
  const command = join(directory, "opencode");
  await writeFile(command, "", "utf8");
  await chmod(command, 0o755);
  await writeFile(join(directory, "kimi.CMD"), "", "utf8");
  assert.deepEqual(resolveCommand("opencode", { windows: false, pathValue: directory }), { kind: "image", path: command });
  assert.equal(resolveCommand("missing", { windows: false, pathValue: directory }), undefined);
  assert.deepEqual(resolveCommand("kimi", { windows: true, pathExt: ".CMD", pathValue: directory }), {
    kind: "batch",
    path: join(directory, "kimi.CMD"),
  });
  assert.equal(resolveCommand("kimi", { windows: false, pathValue: directory }), undefined);
  assert.equal(platformTarget("darwin", "arm64"), "darwin-aarch64");
  assert.equal(platformTarget("freebsd", "x64"), undefined);
});

test("a fresh registry cache is reused and a failed fetch keeps the previous copy", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-registry-"));
  const cachePath = join(home, "acp-registry.json");
  await mkdir(home, { recursive: true });
  let fetches = 0;
  const fetchText = async () => {
    fetches += 1;
    return registryText;
  };
  const first = await loadAcpRegistry({ cachePath, fetchText });
  assert.equal(first.ok, true);
  assert.equal(fetches, 1);
  let skippedFetches = 0;
  const second = await loadAcpRegistry({
    cachePath,
    fetchText: async () => {
      skippedFetches += 1;
      throw new Error("offline");
    },
  });
  assert.equal(skippedFetches, 0);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.agents.some((agent) => agent.id === "opencode"), true);

  const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(cachePath, stale, stale);
  const third = await loadAcpRegistry({
    cachePath,
    fetchText: async () => JSON.stringify({ agents: [{ id: "cline", name: "Cline", distribution: { npx: { package: "cline@1" } } }] }),
  });
  assert.equal(third.ok, true);
  if (!third.ok) return;
  assert.deepEqual(third.agents.map((agent) => agent.id), ["cline"]);
  assert.equal(JSON.parse(await readFile(cachePath, "utf8")).agents[0].id, "cline");

  await utimes(cachePath, stale, stale);
  const kept = await loadAcpRegistry({ cachePath, fetchText: async () => { throw new Error("offline"); } });
  assert.equal(kept.ok, true);
  if (!kept.ok) return;
  assert.equal(kept.agents[0]?.id, "cline");

  const emptyHome = await mkdtemp(join(tmpdir(), "exterior-registry-"));
  const missing = await loadAcpRegistry({ cachePath: join(emptyHome, "missing.json"), fetchText: async () => { throw new Error("offline"); } });
  assert.deepEqual(missing, { ok: false, message: "Cannot read the ACP registry." });
});
