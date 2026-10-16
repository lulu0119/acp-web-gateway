import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { writeDaemonState } from "../daemon-state.js";
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
  for (const relayUrl of relayUrls) await writeSignIn({ relayUrl, accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }, home);
  return home;
}

test("no command, --help, and --version answer on stdout", async () => {
  const bare = await run([]);
  assert.equal(bare.code, 0);
  assert.match(bare.stdout, /Commands:\n {2}login +Sign this device in/);
  assert.match(bare.stdout, /agent-config +Manage the agents/);

  const login = await run(["login", "--help"]);
  assert.equal(login.code, 0);
  assert.match(login.stdout, /\$ exterior login \[options\]/);
  assert.match(login.stdout, /--relay <url> +Exterior relay address/);
  assert.match(login.stdout, /Examples:\n {2}exterior login --relay relay.example.com/);

  const create = await run(["agent-config", "create", "-h"]);
  assert.match(create.stdout, /\$ exterior agent-config create \[options\]/);
  assert.match(create.stdout, /--env <KEY=VALUE>/);
  assert.match((await run(["agent-config", "--help"])).stdout, /Commands:\n {2}list +Print the agent configuration names/);

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
    [["agent-config"], /^exterior agent-config needs a command:\n {2}exterior agent-config list\n/],
    [["agent-config", "rename"], /^Unknown command "exterior agent-config rename"\. Pick one:/],
    [["agent-config", "remove"], /^Pass --name <name>\./],
    [["agent-config", "list", "--name", "x"], /^Unknown option --name for exterior agent-config list\.\nRun `exterior agent-config list --help`/],
    [["agent-config", "create"], /^Pass --agent-type <type> or --command <command>\./],
    [["agent-config", "create", "--agent-type", "opencode", "--command", "x"], /^Pass --agent-type or --command, not both\./],
    [["agent-config", "create", "--command", "x", "--env", "nope"], /^--env takes KEY=VALUE, got "nope"\./],
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
  assert.equal(result.stderr, "Exterior did not answer at http://127.0.0.1:9.\n");
});

test("agent-config create stores a custom command with its environment", async () => {
  const result = await run(["agent-config", "create", "--command", "my-agent --stdio", "--name", "123", "--env", "A=1", "--env", "B=x=y"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Created agent configuration \"123\" (custom).\n");
  const saved = JSON.parse(await readFile(join(result.home, ".config", "exterior", "config.json"), "utf8"));
  assert.deepEqual(saved.agents, [{ name: "123", agentType: "custom", env: { A: "1", B: "x=y" }, command: "my-agent", args: ["--stdio"] }]);
  assert.equal((await run(["agent-config", "list"], { home: result.home })).code, 0);
});

test("agent-config list --json names environment variables without their values, and remove deletes one", async () => {
  const created = await run(["agent-config", "create", "--command", "my-agent --stdio", "--name", "mine", "--env", "API_KEY=secret"]);
  const home = created.home;
  const listed = await run(["agent-config", "list", "--json"], { home });
  assert.deepEqual(JSON.parse(listed.stdout), {
    agents: [{ name: "mine", agentType: "custom", envNames: ["API_KEY"], command: ["my-agent", "--stdio"] }],
  });
  assert.equal(listed.stdout.includes("secret"), false);

  const missing = await run(["agent-config", "remove", "--name", "other"], { home });
  assert.equal(missing.code, 1);
  assert.equal(missing.stderr, "No agent configuration is named \"other\".\n");
  const removed = await run(["agent-config", "remove", "--name", "mine"], { home });
  assert.equal(removed.stdout, "Removed agent configuration \"mine\".\n");
  assert.deepEqual(JSON.parse((await run(["agent-config", "list", "--json"], { home })).stdout), { agents: [] });
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

test("a relay address may leave out the scheme", () => {
  assert.equal(parseRelayUrl("relay.apps.example.win"), "https://relay.apps.example.win");
  assert.equal(parseRelayUrl("127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(parseRelayUrl("localhost:8787"), "http://localhost:8787");
  assert.equal(parseRelayUrl("http://exterior.example/path"), "http://exterior.example");
  assert.equal(parseRelayUrl("ftp://exterior.example"), undefined);
  assert.equal(parseRelayUrl("notaurl"), undefined);
});
