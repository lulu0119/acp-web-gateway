import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { writeSignIn } from "../sign-ins.js";
import { executeCli } from "./cli.js";
import { parseRelayUrl } from "./relay.js";

async function run(args: string[], input: { home?: string; env?: NodeJS.ProcessEnv } = {}) {
  const home = input.home ?? (await mkdtemp(join(tmpdir(), "mukae-cli-")));
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
  const home = await mkdtemp(join(tmpdir(), "mukae-cli-"));
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
  assert.match(login.stdout, /\$ mukae login \[options\]/);
  assert.match(login.stdout, /--relay <url> +Mukae relay address/);
  assert.match(login.stdout, /Examples:\n {2}mukae login --relay relay.example.com/);

  const create = await run(["agent-config", "create", "-h"]);
  assert.match(create.stdout, /\$ mukae agent-config create \[options\]/);
  assert.match(create.stdout, /--env <KEY=VALUE>/);
  assert.match((await run(["agent-config", "--help"])).stdout, /Commands:\n {2}list +Print the agent configuration names/);

  assert.match((await run(["--version"])).stdout, /^\d+\.\d+\.\d+/);
});

test("a mistyped command names the mistake and exits with 2", async () => {
  const cases: [string[], RegExp][] = [
    [["nope"], /^Unknown command "nope"\.\nRun `mukae --help` for usage\.\n$/],
    [["login", "--relay"], /^option `--relay <url>` value is missing\nRun `mukae login --help` for usage\.\n$/],
    [["login", "--relay", "notaurl"], /^--relay is not a relay address: notaurl\n/],
    [["daemon", "--relay", "a.example", "--relay", "b.example"], /^--relay can be given only once\./],
    [["status", "extra"], /^Unused args: `extra`/],
    [["status", "--relay", "a.example"], /^Unknown option `--relay`/],
    [["agent-config"], /^mukae agent-config needs a command:\n {2}mukae agent-config list\n/],
    [["agent-config", "remove"], /^Unknown command "mukae agent-config remove"\. Pick one:/],
    [["agent-config", "list", "--name", "x"], /^Unknown option --name for mukae agent-config list\.\nRun `mukae agent-config list --help`/],
    [["agent-config", "create"], /^Pass --agent-type <type> or --command <command>\./],
    [["agent-config", "create", "--agent-type", "opencode", "--command", "x"], /^Pass --agent-type or --command, not both\./],
    [["agent-config", "create", "--command", "x", "--env", "nope"], /^--env takes KEY=VALUE, got "nope"\./],
  ];
  for (const [args, message] of cases) {
    const result = await run(args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.stderr, message, args.join(" "));
  }
  const environment = await run(["status"], { env: { MUKAE_RELAY: "nope" } });
  assert.equal(environment.code, 0);
  const daemon = await run(["daemon"], { env: { MUKAE_RELAY: "nope" } });
  assert.equal(daemon.code, 2);
  assert.match(daemon.stderr, /^MUKAE_RELAY is not a relay address: nope\n/);
});

test("without --relay, one sign-in is the default and several are listed", async () => {
  const none = await run(["daemon"]);
  assert.equal(none.code, 1);
  assert.equal(none.stderr, "This device is not signed in. Run mukae login --relay <url>.\n");

  const two = await signedIn("http://127.0.0.1:8787", "https://mukae.example");
  const ambiguous = await run(["daemon"], { home: two });
  assert.equal(ambiguous.code, 1);
  assert.equal(ambiguous.stderr, [
    "This device is signed in to 2 relays. Pick one:",
    "  mukae daemon --relay http://127.0.0.1:8787",
    "  mukae daemon --relay https://mukae.example",
    "",
  ].join("\n"));
  assert.match((await run(["login"], { home: two })).stderr, /Pick one:\n {2}mukae login --relay/);
  assert.equal((await run(["status"], { home: two })).stdout, "Signed in to http://127.0.0.1:8787\nSigned in to https://mukae.example\n");

  const picked = await run(["daemon"], { home: two, env: { MUKAE_RELAY: "mukae.example" } });
  assert.equal(picked.stderr, "No agent configurations.\nNext: mukae agent-config create --agent-type opencode\n");

  assert.equal((await run(["logout", "--relay", "127.0.0.1:8787"], { home: two })).stdout, "Signed out of http://127.0.0.1:8787.\n");
  assert.equal((await run(["status"], { home: two })).stdout, "Signed in to https://mukae.example\n");
  assert.equal((await run(["logout", "--relay", "127.0.0.1:8787"], { home: two })).stderr, "This device is not signed in to http://127.0.0.1:8787.\n");
});

test("login names the relay when nothing answers", async () => {
  const result = await run(["login"], { env: { MUKAE_RELAY: "127.0.0.1:9" } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "Signing in to http://127.0.0.1:9.\n");
  assert.equal(result.stderr, "Mukae did not answer at http://127.0.0.1:9.\n");
});

test("agent-config create stores a custom command with its environment", async () => {
  const result = await run(["agent-config", "create", "--command", "my-agent --stdio", "--name", "123", "--env", "A=1", "--env", "B=x=y"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Created agent configuration \"123\" (custom).\n");
  const saved = JSON.parse(await readFile(join(result.home, ".config", "mukae", "config.json"), "utf8"));
  assert.deepEqual(saved.agents, [{ name: "123", agentType: "custom", env: { A: "1", B: "x=y" }, command: "my-agent", args: ["--stdio"] }]);
  assert.equal((await run(["agent-config", "list"], { home: result.home })).code, 0);
});

test("a relay address may leave out the scheme", () => {
  assert.equal(parseRelayUrl("relay.apps.example.win"), "https://relay.apps.example.win");
  assert.equal(parseRelayUrl("127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(parseRelayUrl("localhost:8787"), "http://localhost:8787");
  assert.equal(parseRelayUrl("http://mukae.example/path"), "http://mukae.example");
  assert.equal(parseRelayUrl("ftp://mukae.example"), undefined);
  assert.equal(parseRelayUrl("notaurl"), undefined);
});
