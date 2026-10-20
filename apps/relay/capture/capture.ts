// Captures the relay's pages from a running build, for a before/after pair in a
// pull request. See .agents/skills/create-pr/references/visual-evidence.md.
//
// Start it from the tree you want to capture, after `pnpm --filter @exterior/relay build`:
//
//   node --experimental-strip-types apps/relay/capture/capture.ts --label before --surface dashboard
//
// It serves the built relay from a scratch directory, seeds one account with a
// fixed set of devices, and writes one PNG per named page and viewport into
// `.captures/<label>/`. Pass `--surface` for each page this change affects.
// The images are git-ignored; the `upload-github-attachment` skill turns them
// into pull request URLs.

import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beginDeviceAuthorization, fetchPublicClients, pollDeviceAuthorization } from "@exterior/client";
import { connectionsPath, daemonPath, relayWebSocketUrl, type AgentSlot, type DaemonMessage, type DevicePlatform } from "@exterior/contract";
import Database from "better-sqlite3";
import { chromium, type Browser } from "playwright";
import WebSocket from "ws";
import { openDeviceStore } from "../dist/server/devices/store.js";
import { openExteriorAuth, type ExteriorAuth } from "../dist/server/identity/auth.js";

const relayRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(relayRoot, "../..");
const seedSecret = "exterior-capture-secret-exterior-capture-secret";
const settledTimeoutMs = 10_000;

/** One page to capture. `ready` must also hold in the base revision being compared against. */
type Surface = {
  name: string;
  path: string;
  /** Patient by default: a page whose own content arrives after load needs its own condition. */
  ready: (page: import("playwright").Page) => Promise<unknown>;
};

const surfaces: Surface[] = [
  {
    name: "dashboard",
    path: "/",
    // The dashboard fetches its data after load, so the heading alone would capture a spinner.
    ready: async (page) => {
      await page.waitForSelector("#devices-heading");
      await page.getByText("studio-mac", { exact: true }).waitFor();
    },
  },
  {
    name: "setup-dialog",
    path: "/",
    // "Set up a new device" from the Add device menu.
    ready: async (page) => {
      await page.getByRole("button", { name: "More ways to add a device" }).click();
      await page.getByRole("menuitem", { name: /Set up a new device/ }).click();
      await page.waitForSelector("[role=dialog] [role=tablist]");
    },
  },
  {
    name: "remove-device-dialog",
    path: "/",
    // Remove on the first online device.
    ready: async (page) => {
      await page.getByRole("button", { name: "Remove laptop" }).click();
      await page.getByRole("button", { name: "Remove device" }).waitFor();
    },
  },
  {
    name: "authorized-apps",
    path: "/",
    // The dashboard's second section, below the devices.
    ready: async (page) => {
      await page.waitForFunction(() => document.querySelectorAll("[aria-labelledby=apps-heading] [role=listitem]").length > 0);
      await page.evaluate(() => document.querySelector("#apps-heading")?.scrollIntoView({ block: "start" }));
    },
  },
  {
    name: "consent",
    path: "/",
    // A web app on this computer asking for the first time.
    ready: async (page) => {
      const origin = new URL(page.url()).origin;
      const clientId = await registerApp(origin, { client_name: "Example", redirect_uris: ["http://localhost:5173/oauth/callback"], application_type: "native" });
      await page.goto(authorizeUrl(origin, clientId, "http://localhost:5173/oauth/callback"));
      await page.waitForSelector("text=wants to use agents on your devices");
    },
  },
  { name: "sign-in", path: "/sign-in", ready: async (page) => await page.waitForSelector("form") },
  { name: "device-code", path: "/device", ready: async (page) => await page.waitForSelector("form") },
  {
    name: "device-approval",
    path: "/",
    // A daemon that just asked to sign in, opened from the link it printed.
    ready: async (page) => {
      const origin = new URL(page.url()).origin;
      const clients = await fetchPublicClients(origin);
      const pending = await beginDeviceAuthorization({ relayUrl: origin, clientId: clients.daemonClientId });
      await page.goto(`${origin}/device?user_code=${encodeURIComponent(pending.userCode)}`);
      await page.waitForSelector("text=Connect this device?");
    },
  },
];

/** Example's own mark, as the inline image a registered app in this fixture sends. */
const fixtureLogo = `data:image/png;base64,${(await readFile(join(repositoryRoot, "apps/example/public/oauth-client-logo.png"))).toString("base64")}`;

/**
 * The devices the captures show: two online, one gone under an hour, one gone nine days. The last
 * one never reported a platform, so its card has no operating-system icon.
 */
const fixtureDevices: { id: string; hostname: string; platform?: DevicePlatform; agents: AgentSlot[]; lastSeenMinutesAgo: number }[] = [
  {
    id: "device-studio",
    hostname: "studio-mac",
    platform: "macos",
    agents: [{ name: "work", agentType: "claude-acp" }, { name: "research", agentType: "codex-acp" }, { name: "opencode", agentType: "opencode" }],
    lastSeenMinutesAgo: 0,
  },
  { id: "device-laptop", hostname: "laptop", platform: "windows", agents: [{ name: "work", agentType: "gemini" }], lastSeenMinutesAgo: 0 },
  { id: "device-server", hostname: "build-server", platform: "linux", agents: [], lastSeenMinutesAgo: 43 },
  { id: "device-old", hostname: "old-laptop", agents: [], lastSeenMinutesAgo: 60 * 24 * 9 },
];

/** The apps the account has authorized: one that named a logo, one that did not. */
const fixtureApps: { client_name: string; redirect_uris: string[]; logo_uri?: string; application_type: "web" | "native" }[] = [
  {
    client_name: "Example",
    redirect_uris: ["https://lulu0119.github.io/exterior/oauth/callback"],
    // The real app names the logo beside its metadata document; a capture has no internet to load it.
    logo_uri: fixtureLogo,
    application_type: "web",
  },
  { client_name: "Notes", redirect_uris: ["https://notes.example.test/callback"], application_type: "web" },
];

/** Registers a web app with the relay, as `@exterior/client` does (RFC 7591). */
async function registerApp(publicUrl: string, metadata: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${publicUrl}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...metadata,
    }),
  });
  if (!response.ok) throw new Error(`Registering ${String(metadata.client_name)} failed (HTTP ${response.status}).`);
  return ((await response.json()) as { client_id: string }).client_id;
}

/** The address a person is sent to so they can approve an app. */
function authorizeUrl(publicUrl: string, clientId: string, redirectUri: string): string {
  const url = new URL("/api/auth/oauth2/authorize", publicUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "devices offline_access");
  url.searchParams.set("state", randomUUID());
  url.searchParams.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", publicUrl);
  return url.href;
}

/** RFC 7636's example verifier, whose challenge `authorizeUrl` sends. */
const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

/**
 * Approves each fixture app through the consent page and redeems its code, so Authorized apps lists
 * them and each holds an access token to open agents with. Answers the tokens by app name.
 */
async function authorizeApps(input: { publicUrl: string; sessionCookie: string }): Promise<Map<string, string>> {
  const headers = { cookie: input.sessionCookie };
  const tokens = new Map<string, string>();
  for (const fixture of fixtureApps) {
    const clientId = await registerApp(input.publicUrl, fixture);
    const url = authorizeUrl(input.publicUrl, clientId, fixture.redirect_uris[0] ?? "");
    // A request that is not a browser navigation gets the redirect as JSON.
    const prompted = await fetch(url, { headers });
    const redirect = ((await prompted.json().catch(() => ({}))) as { url?: string }).url ?? "";
    const consent = new URL(redirect, input.publicUrl);
    if (consent.pathname !== "/consent") throw new Error(`Authorizing ${fixture.client_name} did not reach the consent page (HTTP ${prompted.status}).`);
    const approved = await fetch(`${input.publicUrl}/consent`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ accept: "yes", query: consent.search.slice(1) }),
      redirect: "manual",
    });
    if (approved.status !== 302) throw new Error(`Authorizing ${fixture.client_name} failed (HTTP ${approved.status}).`);
    const code = new URL(approved.headers.get("location") ?? "", input.publicUrl).searchParams.get("code") ?? "";
    const exchanged = await fetch(`${input.publicUrl}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: fixture.redirect_uris[0] ?? "",
        client_id: clientId,
        code_verifier: codeVerifier,
        resource: input.publicUrl,
      }),
    });
    if (!exchanged.ok) throw new Error(`Redeeming ${fixture.client_name}'s code failed (HTTP ${exchanged.status}).`);
    tokens.set(fixture.client_name, ((await exchanged.json()) as { access_token: string }).access_token);
  }
  return tokens;
}

/** Agents the fixture apps hold open while the pages are captured, so devices and apps show who uses what. */
const fixtureSessions: { app: string; deviceId: string; agentName: string }[] = [
  { app: "Example", deviceId: "device-studio", agentName: "work" },
  { app: "Notes", deviceId: "device-studio", agentName: "research" },
  { app: "Example", deviceId: "device-laptop", agentName: "work" },
];

async function openFixtureSessions(input: { publicUrl: string; tokens: Map<string, string> }): Promise<void> {
  for (const fixture of fixtureSessions) {
    const opened = await fetch(new URL(connectionsPath, input.publicUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${input.tokens.get(fixture.app) ?? ""}`, "content-type": "application/json" },
      body: JSON.stringify({ deviceId: fixture.deviceId, agentName: fixture.agentName }),
    });
    if (!opened.ok) throw new Error(`${fixture.app} could not open ${fixture.agentName} (HTTP ${opened.status}).`);
  }
}

type Options = {
  label: string;
  port: number;
  viewport: string;
  outDir: string;
  surfaces: string[];
};

const usage = "Usage: capture.ts --label <before|after> --surface <name> [--surface <name>] [--port 8799] [--viewport 1440x900] [--out <dir>]\n";

/**
 * Placeholder GitHub credentials. The relay renders "GitHub sign-in is not set up" without them,
 * which is not the page anyone is reviewing; with them, `/sign-in` shows its real form.
 */
const placeholderGithub = { clientId: "capture-client-id", clientSecret: "capture-client-secret" };

function parseOptions(argv: string[]): Options {
  const options: Options = { label: "", port: 8799, viewport: "1440x900", outDir: join(repositoryRoot, ".captures"), surfaces: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--label") {
      options.label = argv[++index] ?? "";
      continue;
    }
    if (argument === "--port") {
      options.port = Number(argv[++index]);
      continue;
    }
    if (argument === "--viewport") {
      options.viewport = argv[++index] ?? "";
      continue;
    }
    if (argument === "--out") {
      options.outDir = resolve(argv[++index] ?? "");
      continue;
    }
    if (argument === "--surface") {
      const name = argv[++index] ?? "";
      if (!name) throw new Error(`--surface needs a page name. ${usage}`);
      options.surfaces.push(name);
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(usage);
      process.exit(0);
    }
    throw new Error(`Unknown option: ${argument}\n${usage}`);
  }
  // The label names both the output directory and which side of the pair this is.
  if (options.label !== "before" && options.label !== "after") {
    throw new Error(`Pass --label before or --label after. ${usage}`);
  }
  if (!Number.isInteger(options.port) || options.port <= 0) throw new Error(`--port must be a port number, got ${options.port}`);
  if (!/^\d+x\d+$/.test(options.viewport)) throw new Error(`--viewport must look like 1440x900, got ${options.viewport}`);
  const known = surfaces.map((surface) => surface.name);
  if (options.surfaces.length === 0) throw new Error(`Pass --surface for each page this change affects. Known: ${known.join(", ")}. ${usage}`);
  const unknown = options.surfaces.filter((name) => !known.includes(name));
  if (unknown.length > 0) throw new Error(`Unknown page: ${unknown.join(", ")}. Known: ${known.join(", ")}.`);
  return options;
}

/** Signs a better-auth session token into the cookie value the browser would send, as testing.ts does. */
function signSessionToken(token: string): string {
  const signature = createHmac("sha256", seedSecret).update(token).digest("base64");
  return `${token}.${signature}`;
}

/**
 * Creates the account the captures sign in as, plus its devices.
 *
 * The devices are written to the store directly rather than through a daemon, so the pair shows a
 * fixed set: two online, one that has been gone under an hour, one that has been gone nine days.
 *
 * Returns both the signed value the browser cookie carries and the `cookie` header the approval
 * request needs, so the harness never has to take its own cookie apart.
 */
async function seedAccount(input: { databasePath: string; publicUrl: string }): Promise<{ value: string; cookie: string }> {
  const database = new Database(input.databasePath);
  const exterior: ExteriorAuth = await openExteriorAuth({
    database,
    secret: seedSecret,
    publicUrl: input.publicUrl,
    githubClientId: placeholderGithub.clientId,
    githubClientSecret: placeholderGithub.clientSecret,
  });
  const context = await exterior.auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: "Ada Lovelace", email: "ada@example.test", emailVerified: true },
    { method: "capture" },
  );
  const session = await context.internalAdapter.createSession(user.id);
  const devices = openDeviceStore(database);
  for (const fixture of fixtureDevices) {
    const seen = { userId: user.id, deviceId: fixture.id, hostname: fixture.hostname, now: Date.now() - fixture.lastSeenMinutesAgo * 60 * 1000 };
    devices.record(seen);
    // What the relay keeps from the device's last connection.
    devices.touch({ ...seen, platform: fixture.platform });
  }
  database.close();
  const value = signSessionToken(session.token);
  return { value, cookie: `better-auth.session_token=${value}` };
}

/**
 * Serves the built relay with its database in a scratch directory, so no run leaves state behind.
 *
 * The relay resolves `dist/public` and `data/relay.sqlite` against its working directory, so the
 * scratch directory links to the build instead of copying it. Same shape as the acceptance adapter's
 * "start relay" step.
 */
async function startRelay(input: { cwd: string; publicUrl: string; port: number }): Promise<{ stop: () => Promise<void> }> {
  await link(join(relayRoot, "dist"), join(input.cwd, "dist"));
  await link(join(relayRoot, "node_modules"), join(input.cwd, "node_modules"));

  const relay = spawn(process.execPath, [join(input.cwd, "dist", "main.js")], {
    cwd: input.cwd,
    env: {
      ...process.env,
      BETTER_AUTH_URL: input.publicUrl,
      BETTER_AUTH_SECRET: seedSecret,
      GITHUB_CLIENT_ID: placeholderGithub.clientId,
      GITHUB_CLIENT_SECRET: placeholderGithub.clientSecret,
      HOST: "127.0.0.1",
      PORT: String(input.port),
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  let spawnFailure: Error | undefined;
  relay.once("error", (error) => {
    spawnFailure = error;
  });

  const stop = async () => {
    if (relay.exitCode !== null) return;
    relay.kill();
    await new Promise((done) => relay.once("exit", done));
  };

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    // Checked first: a relay that died (a taken port, a missing build) must not be mistaken for
    // whichever process is already answering on that port. `/health` alone is not enough for that
    // either, since an unrelated preview server answers it with the same status.
    if (relay.exitCode !== null) {
      throw new Error(
        `The relay exited with code ${relay.exitCode}. Build it first (\`pnpm build\` from the repository root), and check that port ${input.port} is free.`,
      );
    }
    if (await isThisRelay(input.publicUrl)) return { stop };
    await new Promise((done) => setTimeout(done, 200));
  }
  await stop();
  throw new Error(`${input.publicUrl} did not start answering as an Exterior relay within 30s. Is port ${input.port} taken by another process?`);
}

/** Only the relay serves OAuth discovery under `/api/auth`, so a 200 there means this is our process. */
async function isThisRelay(publicUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${publicUrl}/api/auth/.well-known/openid-configuration`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return false;
    const body: unknown = await response.json().catch(() => undefined);
    return typeof body === "object" && body !== null && "device_authorization_endpoint" in body;
  } catch {
    return false;
  }
}

/** A directory link that works on Windows without elevation (junction) and elsewhere (symlink). */
async function link(target: string, path: string): Promise<void> {
  await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
}

/**
 * Removes the scratch directory. The links have to be detached first: a Windows junction is held
 * open, so deleting the directory that contains it fails with `EBUSY` until the link is gone.
 * The build it linked to is left untouched.
 */
async function removeRunDir(runDir: string): Promise<void> {
  for (const name of ["dist", "node_modules"]) {
    await unlink(join(runDir, name)).catch(() => undefined);
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(runDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt >= 5) {
        process.stderr.write(`Could not remove the scratch directory ${runDir}: ${String(error)}\n`);
        return;
      }
      await new Promise((done) => setTimeout(done, 200 * (attempt + 1)));
    }
  }
}

async function capture(input: { browser: Browser; publicUrl: string; sessionValue: string; options: Options }): Promise<string[]> {
  const written: string[] = [];

  const context = await input.browser.newContext({
    deviceScaleFactor: 2,
    viewport: {
      width: Number(input.options.viewport.split("x")[0]),
      height: Number(input.options.viewport.split("x")[1]),
    },
    // Animations off is not enough on its own: the pair must not differ by a transition mid-flight.
    reducedMotion: "reduce",
  });
  await context.addCookies([{ name: "better-auth.session_token", value: input.sessionValue, domain: "127.0.0.1", path: "/" }]);
  try {
    const selected = surfaces.filter((surface) => input.options.surfaces.includes(surface.name));
    for (const surface of selected) {
      const page = await context.newPage();
      const response = await page.goto(`${input.publicUrl}${surface.path}`, { waitUntil: "domcontentloaded" });
      if (!response?.ok()) throw new Error(`${surface.path} answered ${response?.status() ?? "no response"}`);
      await surface.ready(page);
      // Fonts and remote marks load after the DOM settles; a capture before they land shows fallback metrics or empty circles.
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => (img.complete ? undefined : img.decode().catch(() => undefined))));
      });
      await page.mouse.move(0, 0);
      const file = join(input.options.outDir, input.options.label, `${surface.name}-${input.options.viewport}.png`);
      await page.screenshot({ path: file, animations: "disabled", timeout: settledTimeoutMs });
      written.push(file);
      await page.close();
    }
  } finally {
    await context.close();
  }
  return written;
}

/**
 * Signs a daemon in through the relay's own device-code flow and approves it with the seeded session.
 *
 * The devices are written to the store directly, so a fixture is listed whether or not it is online.
 * This is what makes the online ones online: their daemon announces itself over the real socket.
 *
 * The approval itself is two requests: the relay only accepts `approve` for a code a signed-in
 * session has already claimed, which is what the real flow gets from opening the approval page.
 */
async function mintDaemonToken(input: { publicUrl: string; sessionCookie: string }): Promise<string> {
  const clients = await fetchPublicClients(input.publicUrl);
  const pending = await beginDeviceAuthorization({ relayUrl: input.publicUrl, clientId: clients.daemonClientId });
  const headers = { cookie: input.sessionCookie };
  const claimed = await fetch(`${input.publicUrl}/device?user_code=${encodeURIComponent(pending.userCode)}`, { headers });
  if (!claimed.ok) throw new Error(`Opening the approval page for the capture device failed (HTTP ${claimed.status}).`);
  const approval = await fetch(`${input.publicUrl}/device`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams({ userCode: pending.userCode, decision: "approve" }),
    redirect: "manual",
  });
  if (approval.status === 302) throw new Error("The seeded session was not accepted; the approval page redirected to sign-in.");
  if (!approval.ok) throw new Error(`Approving the capture device failed (HTTP ${approval.status}).`);
  const tokens = await pollDeviceAuthorization(pending);
  return tokens.accessToken;
}

/** A daemon that announces itself and then stays connected, so the pair shows agents, not "Agents shown when online". */
async function connectDaemon(input: { publicUrl: string; accessToken: string; deviceId: string; hostname: string; platform: DevicePlatform; agents: AgentSlot[] }): Promise<{ close: () => void }> {
  const socket = new WebSocket(relayWebSocketUrl(input.publicUrl, daemonPath), {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  await new Promise<void>((ready, failed) => {
    socket.once("open", () => ready());
    socket.once("error", (error: Error) => failed(error));
  });
  const hello: DaemonMessage = {
    type: "hello",
    hostname: input.hostname,
    deviceId: input.deviceId,
    workingDirectory: "/home/ada/.local/share/exterior/workspace",
    agents: input.agents,
    platform: input.platform,
  };
  socket.send(JSON.stringify(hello));
  // Agrees to every session, as a running agent would; nothing reads the frames.
  socket.on("message", (data: Buffer) => {
    const message = JSON.parse(data.toString()) as { type: string; sessionId?: string };
    if (message.type === "open") socket.send(JSON.stringify({ type: "opened", sessionId: message.sessionId }));
  });
  return { close: () => socket.close() };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const publicUrl = `http://127.0.0.1:${options.port}`;
  const runDir = join(tmpdir(), `exterior-capture-${randomUUID()}`);
  await mkdir(join(runDir, "data"), { recursive: true });

  const session = await seedAccount({ databasePath: join(runDir, "data", "relay.sqlite"), publicUrl });
  const relay = await startRelay({ cwd: runDir, publicUrl, port: options.port });
  const daemons: { close: () => void }[] = [];
  const browser = await chromium.launch();
  try {
    const tokens = await authorizeApps({ publicUrl, sessionCookie: session.cookie });
    const accessToken = await mintDaemonToken({ publicUrl, sessionCookie: session.cookie });
    for (const fixture of fixtureDevices) {
      // Only the devices the pair should show as online hold a connection.
      if (fixture.lastSeenMinutesAgo !== 0) continue;
      if (!fixture.platform) throw new Error(`${fixture.hostname} is online without a platform.`);
      daemons.push(await connectDaemon({ publicUrl, accessToken, deviceId: fixture.id, hostname: fixture.hostname, platform: fixture.platform, agents: fixture.agents }));
    }
    await openFixtureSessions({ publicUrl, tokens });
    for (const file of await capture({ browser, publicUrl, sessionValue: session.value, options })) process.stdout.write(`${file}\n`);
  } finally {
    for (const daemon of daemons) daemon.close();
    await browser.close();
    await relay.stop();
    await removeRunDir(runDir);
  }
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
