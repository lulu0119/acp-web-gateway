import assert from "node:assert/strict";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { platformTarget } from "../acp-registry.js";
import { writeDaemonState } from "../daemon-state.js";
import { deviceIdOf } from "@exterioragentprotocol/sdk/device";
import { deviceKeyFor, readDeviceKey } from "../device-keys.js";
import { writeSignIn } from "../sign-ins.js";
import { executeCli } from "./cli.js";
import { parseRelayUrl } from "./relay.js";

async function run(args: string[], input: { home?: string; env?: NodeJS.ProcessEnv } = {}) {
  const home = input.home ?? (await mkdtemp(join(tmpdir(), "exterior-cli-")));
  let stdout = "";
  let stderr = "";
  const code = await executeCli(args, {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    env: input.env ?? {},
    homeDirectory: home,
  });
  return { code, stdout, stderr, home };
}

async function signedIn(...relayUrls: string[]): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "exterior-cli-"));
  for (const relayUrl of relayUrls) await writeSignIn({ relayUrl, clientId: "device-studio-1", accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }, home);
  return home;
}

test("no command, --help, and --version answer on stdout", async () => {
  const bare = await run([]);
  assert.equal(bare.code, 0);
  assert.match(bare.stdout, /Commands:\n {2}login +Sign this device in/);
  assert.match(bare.stdout, /agent +Manage the agents this device offers/);
  assert.match(bare.stdout, /registry +Look up agent types/);

  const login = await run(["login", "--help"]);
  assert.equal(login.code, 0);
  assert.match(login.stdout, /\$ exterior login \[options\]/);
  assert.match(login.stdout, /--relay <url> +Exterior relay address/);
  assert.match(login.stdout, /Examples:\n {2}exterior login --relay relay.example.com/);

  const create = await run(["agent", "create", "-h"]);
  assert.match(create.stdout, /\$ exterior agent create \[options\] <type>\n {2}\$ exterior agent create \[options\] --name <name> -- <command> \[args\.\.\.\]/);
  assert.match(create.stdout, /--env <KEY=VALUE>/);
  assert.match((await run(["agent", "--help"])).stdout, /Commands:\n {2}list +Print the agents this device offers/);

  assert.match((await run(["--version"])).stdout, /^\d+\.\d+\.\d+/);
});

test("a mistyped command names the mistake and exits with 2", async () => {
  const cases: [string[], RegExp][] = [
    [["nope"], /^Unknown command "nope"\.\nRun `exterior --help` for usage\.\n$/],
    [["login", "--relay"], /^option `--relay <url>` value is missing\nRun `exterior login --help` for usage\.\n$/],
    [["login", "--relay", "notaurl"], /^--relay is not a relay address: notaurl\n/],
    [["daemon", "--relay", "a.example", "--relay", "b.example"], /^--relay can be given only once\./],
    [["status", "extra"], /^Unused args: `extra`/],
    [["status", "--relay", "a.example"], /^Unknown option `--relay`/],
    [["agent"], /^exterior agent needs a command:\n {2}exterior agent list\n/],
    [["agent", "rename"], /^Unknown command "exterior agent rename"\. Pick one:/],
    [["agent", "remove"], /^Name the agents to remove, from `exterior agent list`\./],
    [["agent", "list", "--name", "x"], /^Unknown option --name for exterior agent list\.\nRun `exterior agent list --help`/],
    [["agent", "list", "extra"], /^Unexpected argument "extra"\./],
    [["agent", "list", "--", "x"], /^Unexpected argument "x"\./],
    [["agent", "create"], /^Give an agent type from `exterior registry search`, or a command after --\./],
    [["agent", "create", "opencode", "--", "x"], /^Give an agent type or a command after --, not both\./],
    [["agent", "create", "my-agent", "--stdio"], /^Unknown option --stdio for exterior agent create\./],
    [["agent", "create", "my-agent", "stdio"], /^Unexpected argument "stdio"\. A command and its arguments go after --\./],
    [["agent", "create", "--", "my-agent"], /^A command needs --name <name>\./],
    [["agent", "create", "--name", "x", "--env", "nope", "--", "x"], /^--env takes KEY=VALUE, got "nope"\./],
    [["registry", "search", "a", "b"], /^Unexpected argument "b"\. Search for one term\./],
  ];
  for (const [args, message] of cases) {
    const result = await run(args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.stderr, message, args.join(" "));
  }
  const environment = await run(["status"], { env: { EXTERIOR_RELAY: "nope" } });
  assert.equal(environment.code, 0);
  const daemon = await run(["daemon"], { env: { EXTERIOR_RELAY: "nope" } });
  assert.equal(daemon.code, 2);
  assert.match(daemon.stderr, /^EXTERIOR_RELAY is not a relay address: nope\n/);
});

test("without --relay, one sign-in is the default and several are listed", async () => {
  const none = await run(["daemon"]);
  assert.equal(none.code, 1);
  assert.equal(none.stderr, "This device is not signed in. Run exterior login --relay <url>.\n");

  const two = await signedIn("http://127.0.0.1:8787", "https://exterior.example");
  const ambiguous = await run(["daemon"], { home: two });
  assert.equal(ambiguous.code, 1);
  assert.equal(ambiguous.stderr, [
    "This device is signed in to 2 relays. Pick one:",
    "  exterior daemon --relay http://127.0.0.1:8787",
    "  exterior daemon --relay https://exterior.example",
    "",
  ].join("\n"));
  assert.match((await run(["login"], { home: two })).stderr, /Pick one:\n {2}exterior login --relay/);
  assert.equal((await run(["status"], { home: two })).stdout, "Signed in to http://127.0.0.1:8787\nSigned in to https://exterior.example\n");

  // An unreadable configuration stops the daemon after it picked a relay, before it connects.
  await mkdir(join(two, ".config", "exterior"), { recursive: true });
  await writeFile(join(two, ".config", "exterior", "config.json"), "{");
  const picked = await run(["daemon"], { home: two, env: { EXTERIOR_RELAY: "exterior.example" } });
  assert.equal(picked.code, 1);
  assert.equal(picked.stderr, `Cannot read ${join(two, ".config", "exterior", "config.json")} as JSON.\n`);

  assert.equal((await run(["logout", "--relay", "127.0.0.1:8787"], { home: two })).stdout, "Signed out of http://127.0.0.1:8787.\n");
  assert.equal((await run(["status"], { home: two })).stdout, "Signed in to https://exterior.example\n");
  assert.equal((await run(["logout", "--relay", "127.0.0.1:8787"], { home: two })).stderr, "This device is not signed in to http://127.0.0.1:8787.\n");
});

test("logout revokes the sign-in on the relay and keeps the device id", async () => {
  const revoked: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const json = (body: unknown) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
      if (request.url === "/.well-known/oauth-protected-resource") return json({ resource: origin, authorization_servers: [`${origin}/api/auth`] });
      if (request.url === "/api/auth/.well-known/openid-configuration") {
        return json({ issuer: `${origin}/api/auth`, revocation_endpoint: `${origin}/api/auth/oauth2/revoke` });
      }
      if (request.url === "/api/auth/oauth2/revoke") {
        const params = new URLSearchParams(Buffer.concat(chunks).toString());
        revoked.push(`${params.get("client_id")} ${params.get("token_type_hint")} ${params.get("token")}`);
        return response.writeHead(200).end();
      }
      response.writeHead(404).end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const home = await signedIn(origin);
    const deviceId = await deviceIdOf(await deviceKeyFor(origin, home));
    const result = await run(["logout"], { home });
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, `Signed out of ${origin}.\n`);
    assert.deepEqual(revoked, ["device-studio-1 refresh_token r"]);
    assert.equal((await run(["status"], { home })).stdout, "This device is not signed in. Run exterior login --relay <url>.\n");
    const kept = await readDeviceKey(origin, home);
    assert.ok(kept);
    assert.equal(await deviceIdOf(kept), deviceId);
  } finally {
    server.close();
  }
});

test("status says what each relay's daemon last reported, in text and JSON", async () => {
  const home = await signedIn("https://exterior.example", "https://other.example");
  await writeDaemonState({ relayUrl: "https://exterior.example", pid: process.pid, status: "connected", since: 1, agents: ["work"] }, home);
  const text = await run(["status"], { home });
  assert.equal(text.stdout, [
    "Signed in to https://exterior.example. Daemon connected, offering work.",
    "Signed in to https://other.example",
    "",
  ].join("\n"));
  const json = await run(["status", "--json"], { home });
  assert.deepEqual(JSON.parse(json.stdout), {
    relays: [
      { relayUrl: "https://exterior.example", daemon: { relayUrl: "https://exterior.example", pid: process.pid, status: "connected", since: 1, agents: ["work"] } },
      { relayUrl: "https://other.example", daemon: null },
    ],
  });
});

test("login names the relay when nothing answers", async () => {
  const result = await run(["login"], { env: { EXTERIOR_RELAY: "127.0.0.1:9" } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "Signing in to http://127.0.0.1:9.\n");
  assert.equal(result.stderr, "The relay did not answer at http://127.0.0.1:9.\n");
});

test("agent create stores the words after -- as the command, one argument each", async () => {
  const result = await run(["agent", "create", "--name", "123", "--env", "A=1", "--env", "B=x=y", "--", "my-agent", "--stdio"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Created agent \"123\" (custom).\n");
  const saved = JSON.parse(await readFile(join(result.home, ".config", "exterior", "config.json"), "utf8"));
  assert.deepEqual(saved.agents, [{ name: "123", agentType: "custom", env: { A: "1", B: "x=y" }, command: "my-agent", args: ["--stdio"] }]);
  assert.equal((await run(["agent", "list"], { home: result.home })).code, 0);

  // After --, a word is the agent's: Exterior's own options, quotes, and spaces are not read again.
  const shell = await run(["agent", "create", "--name", "box", "--", "sh", "-c", "my-agent --name 'work box'", "", "--help", "--name"]);
  assert.equal(shell.code, 0, shell.stderr);
  const kept = JSON.parse(await readFile(join(shell.home, ".config", "exterior", "config.json"), "utf8"));
  assert.deepEqual(kept.agents, [
    { name: "box", agentType: "custom", env: {}, command: "sh", args: ["-c", "my-agent --name 'work box'", "", "--help", "--name"] },
  ]);
});

test("agent list --json names environment variables without their values, and remove deletes by name", async () => {
  const created = await run(["agent", "create", "--name", "mine", "--env", "API_KEY=secret", "--", "my-agent", "--stdio"]);
  const home = created.home;
  await run(["agent", "create", "--name", "other", "--", "other-agent"], { home });
  await run(["agent", "create", "--name", "third", "--", "third-agent"], { home });
  const listed = await run(["agent", "list", "--json"], { home });
  assert.deepEqual(JSON.parse(listed.stdout), {
    agents: [
      { name: "mine", agentType: "custom", envNames: ["API_KEY"], command: ["my-agent", "--stdio"] },
      { name: "other", agentType: "custom", envNames: [], command: ["other-agent"] },
      { name: "third", agentType: "custom", envNames: [], command: ["third-agent"] },
    ],
  });
  assert.equal(listed.stdout.includes("secret"), false);

  // One missing name removes nothing, so a typo does not leave half the list gone.
  const missing = await run(["agent", "remove", "mine", "missing"], { home });
  assert.equal(missing.code, 1);
  assert.equal(missing.stderr, "No agent is named \"missing\".\n");
  const removed = await run(["agent", "remove", "mine", "other"], { home });
  assert.equal(removed.stdout, "Removed agent \"mine\".\nRemoved agent \"other\".\n");
  assert.deepEqual(JSON.parse((await run(["agent", "list", "--json"], { home })).stdout), {
    agents: [{ name: "third", agentType: "custom", envNames: [], command: ["third-agent"] }],
  });
});

test("a directory is set for sessions, and survives a change to the agents", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-cli-"));
  // Nothing is chosen yet, so the device's own directory is the answer.
  const read = async (...flags: string[]) => (await run(["config", "get", "working-directory", ...flags], { home })).stdout;
  assert.deepEqual(JSON.parse(await read("--json")), {
    workingDirectory: join(home, ".local", "share", "exterior", "workspace"),
    source: "default",
  });

  const chosen = join(home, "projects", "mine");
  const set = await run(["config", "set", "working-directory", chosen], { home });
  assert.equal(set.code, 0, set.stderr);
  assert.equal(set.stdout, `Sessions work in ${chosen}.\n`);
  assert.equal((await stat(chosen)).isDirectory(), true);

  // Adding an agent rewrites the file, and must not drop the directory with it.
  await run(["agent", "create", "--name", "mine", "--", "my-agent"], { home });
  assert.deepEqual(JSON.parse(await read("--json")), { workingDirectory: chosen, source: "chosen" });
  assert.deepEqual(JSON.parse(await readFile(join(home, ".config", "exterior", "config.json"), "utf8")).agents, [
    { name: "mine", agentType: "custom", env: {}, command: "my-agent", args: [] },
  ]);

  // And removing one does not either.
  await run(["agent", "remove", "mine"], { home });
  assert.equal(await read(), `${chosen}\n`);

  // A path that cannot be a directory is refused where it is typed.
  const blocked = join(home, "as-a-file");
  await writeFile(blocked, "not a directory", "utf8");
  const refused = await run(["config", "set", "working-directory", join(blocked, "inside")], { home });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /^Cannot use .* as the working directory: /);
  assert.equal(await read(), `${chosen}\n`);

  const back = await run(["config", "unset", "working-directory"], { home });
  assert.equal(back.stdout, `Sessions work in ${join(home, ".local", "share", "exterior", "workspace")}.\n`);
  assert.equal(JSON.parse(await readFile(join(home, ".config", "exterior", "config.json"), "utf8")).workingDirectory, undefined);
});

test("config names its setting and refuses a mistyped one", async () => {
  const cases: [string[], RegExp][] = [
    [["config"], /^exterior config needs a command:\n {2}exterior config get\n/],
    [["config", "get"], /^Name a setting: working-directory\./],
    [["config", "set", "workdir", "x"], /^Unknown setting "workdir"\. Settings: working-directory\./],
    [["config", "set", "working-directory"], /^Give a value for working-directory\./],
    [["config", "unset", "working-directory", "x"], /^Unexpected argument "x"\./],
  ];
  for (const [args, message] of cases) {
    const result = await run(args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.stderr, message, args.join(" "));
  }
});

test("a second daemon for a relay whose daemon is running exits with 4", async () => {
  const home = await signedIn("https://exterior.example");
  await writeDaemonState({ relayUrl: "https://exterior.example", pid: process.pid + 1_000_000, status: "connected", since: 1, agents: [] }, home);
  // That pid is not running, so the state reads as stopped and does not block.
  await mkdir(join(home, ".config", "exterior"), { recursive: true });
  await writeFile(join(home, ".config", "exterior", "config.json"), "{");
  assert.equal((await run(["daemon"], { home })).code, 1);

  await writeDaemonState({ relayUrl: "https://exterior.example", pid: process.ppid, status: "connected", since: 1, agents: [] }, home);
  const second = await run(["daemon"], { home });
  assert.equal(second.code, 4);
  assert.equal(second.stderr, `A daemon for https://exterior.example is already running (process ${process.ppid}).\n`);
});

test.skipIf(process.platform === "win32")("registry search finds a command the login shell has and this process does not", async () => {
  const target = platformTarget();
  assert.ok(target);
  const home = await mkdtemp(join(tmpdir(), "exterior-cli-"));
  const bin = join(home, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "opencode"), "#!/bin/sh\n");
  await writeFile(join(bin, "npx"), "#!/bin/sh\n");
  await chmod(join(bin, "opencode"), 0o755);
  await chmod(join(bin, "npx"), 0o755);
  const shell = join(home, "shell");
  await writeFile(shell, `#!/bin/sh\nprintf '%s' "__EXTERIOR_PATH__${bin}__EXTERIOR_PATH__"\n`);
  await chmod(shell, 0o755);
  await mkdir(join(home, ".config", "exterior"), { recursive: true });
  await writeFile(join(home, ".config", "exterior", "acp-registry.json"), JSON.stringify({
    agents: [
      { id: "opencode", name: "OpenCode", distribution: { binary: { [target]: { cmd: "./opencode", args: ["acp"] } } } },
      { id: "claude-acp", name: "Claude Agent", distribution: { npx: { package: "@agentclientprotocol/claude-agent-acp@1.0.0" } } },
    ],
  }));
  const listed = await run(["registry", "search", "--json"], { home, env: { PATH: "/usr/bin:/bin", SHELL: shell } });
  assert.equal(listed.code, 0);
  const types = JSON.parse(listed.stdout) as { types: { id: string; ready: boolean; reason?: string }[] };
  assert.equal(types.types.find((type) => type.id === "opencode")?.ready, true);
  const claude = types.types.find((type) => type.id === "claude-acp");
  assert.equal(claude?.ready, true);
  assert.equal(claude?.reason, undefined);
});

test.each(["npx", "uvx"] as const)("registry search says a type using %s is ready when its runner is installed", async (command) => {
  const home = await mkdtemp(join(tmpdir(), "exterior-cli-"));
  const bin = join(home, "bin");
  await mkdir(bin);
  const executable = join(bin, `${command}${process.platform === "win32" ? ".cmd" : ""}`);
  await writeFile(executable, "#!/bin/sh\n");
  await chmod(executable, 0o755);
  await mkdir(join(home, ".config", "exterior"), { recursive: true });
  await writeFile(join(home, ".config", "exterior", "acp-registry.json"), JSON.stringify({
    agents: [{ id: "example-agent", name: "Example Agent", distribution: { [command]: { package: "example-agent@1.0.0" } } }],
  }));
  const env = { PATH: bin, SHELL: join(home, "missing-shell") };
  const listed = await run(["registry", "search", "--json"], { home, env });
  assert.equal(listed.code, 0);
  assert.deepEqual(JSON.parse(listed.stdout), { types: [{ id: "example-agent", name: "Example Agent", ready: true }] });

  const missing = await run(["registry", "search", "--json"], { home, env: { ...env, PATH: home } });
  assert.equal(missing.code, 0);
  assert.deepEqual(JSON.parse(missing.stdout), {
    types: [{ id: "example-agent", name: "Example Agent", ready: false, reason: `"${command}" is not installed.` }],
  });
});

test("a relay address may leave out the scheme", () => {
  assert.equal(parseRelayUrl("relay.apps.example.win"), "https://relay.apps.example.win");
  assert.equal(parseRelayUrl("127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(parseRelayUrl("localhost:8787"), "http://localhost:8787");
  assert.equal(parseRelayUrl("http://exterior.example/path"), "http://exterior.example");
  assert.equal(parseRelayUrl("ftp://exterior.example"), undefined);
  assert.equal(parseRelayUrl("notaurl"), undefined);
});
