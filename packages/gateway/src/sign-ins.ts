import { isRecord } from "@mukae/contract";
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** The credentials a machine holds for one relay. */
export type SignIn = {
  relayUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function configDirectory(homeDirectory: string): string {
  return join(homeDirectory, ".config", "mukae");
}

function signInDirectory(homeDirectory: string): string {
  return join(configDirectory(homeDirectory), "sign-ins");
}

// One file per relay, so daemons for different relays never overwrite each other's rotated refresh token.
function signInPath(relayUrl: string, homeDirectory: string): string {
  const url = new URL(relayUrl);
  return join(signInDirectory(homeDirectory), `${url.protocol.slice(0, -1)}_${url.host.replaceAll(":", "_")}.json`);
}

export function parseSignIn(value: unknown): SignIn | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.relayUrl !== "string" || typeof value.accessToken !== "string" || typeof value.refreshToken !== "string") return undefined;
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return undefined;
  try {
    return {
      relayUrl: new URL(value.relayUrl).origin,
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt,
    };
  } catch {
    return undefined;
  }
}

export async function readSignIns(homeDirectory = homedir()): Promise<SignIn[]> {
  await adoptLegacySignIn(homeDirectory);
  let names: string[];
  try {
    names = await readdir(signInDirectory(homeDirectory));
  } catch {
    return [];
  }
  const signIns: SignIn[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const signIn = await readSignInFile(join(signInDirectory(homeDirectory), name));
    if (signIn) signIns.push(signIn);
  }
  return signIns;
}

export async function readSignIn(relayUrl: string, homeDirectory = homedir()): Promise<SignIn | undefined> {
  await adoptLegacySignIn(homeDirectory);
  const signIn = await readSignInFile(signInPath(relayUrl, homeDirectory));
  return signIn?.relayUrl === new URL(relayUrl).origin ? signIn : undefined;
}

export async function writeSignIn(signIn: SignIn, homeDirectory = homedir()): Promise<void> {
  const relayUrl = new URL(signIn.relayUrl).origin;
  const path = signInPath(relayUrl, homeDirectory);
  await mkdir(signInDirectory(homeDirectory), { recursive: true, mode: 0o700 });
  const draft = `${path}.${process.pid}.tmp`;
  await writeFile(draft, `${JSON.stringify({ ...signIn, relayUrl }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(draft, 0o600);
  await rename(draft, path);
}

export async function removeSignIn(relayUrl: string, homeDirectory = homedir()): Promise<void> {
  await rm(signInPath(relayUrl, homeDirectory), { force: true });
}

/**
 * Picks the relay a command acts on. A requested relay always wins; otherwise a single sign-in is the default,
 * and several sign-ins are ambiguous.
 */
export function chooseRelay(input: {
  requested?: string;
  signedIn: readonly SignIn[];
  command: string;
}): { ok: true; relayUrl: string } | { ok: false; message: string } {
  if (input.requested) return { ok: true, relayUrl: input.requested };
  const [only, ...others] = input.signedIn;
  if (!only) return { ok: false, message: "This machine is not signed in. Run mukae login --relay <url>." };
  if (others.length === 0) return { ok: true, relayUrl: only.relayUrl };
  const choices = input.signedIn.map((signIn) => `  mukae ${input.command} --relay ${signIn.relayUrl}`).join("\n");
  return { ok: false, message: `This machine is signed in to ${input.signedIn.length} relays. Pick one:\n${choices}` };
}

async function readSignInFile(path: string): Promise<SignIn | undefined> {
  try {
    return parseSignIn(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return undefined;
  }
}

// Before sign-ins were per relay, a machine kept one in daemon-session.json.
async function adoptLegacySignIn(homeDirectory: string): Promise<void> {
  const legacyPath = join(configDirectory(homeDirectory), "daemon-session.json");
  const legacy = await readSignInFile(legacyPath);
  if (!legacy) return;
  if (!(await readSignInFile(signInPath(legacy.relayUrl, homeDirectory)))) await writeSignIn(legacy, homeDirectory);
  await rm(legacyPath, { force: true });
}
