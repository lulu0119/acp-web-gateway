import { createHmac, timingSafeEqual } from "node:crypto";
import type { ExteriorAuth } from "./auth.js";
import { parseClientRegistration } from "./clients.js";
import type { Account } from "./session.js";
import type { AccountPage } from "../../shared/account-web.js";

const lifetimeMs = 10 * 60_000;

export type AppSetup = { setupId: string; clientName: string; redirectUri: string };
type Approval = AppSetup & { userId: string; expiresAt: number };
export type AppSetupOutcome =
  | { status: "registered"; clientId: string; clientName: string; redirectUri: string }
  | { status: "denied" }
  | { status: "failed"; code: string; message: string };

/** The assistant chooses the id, such as a UUID. It only finds a public result again, so it needs to be unique, not secret. */
export function isSetupId(value: string): boolean {
  return /^[A-Za-z0-9_-]{22,128}$/.test(value);
}

export function parseAppSetup(params: URLSearchParams): AppSetup | string {
  const setupId = params.get("setup_id") ?? "";
  if (!isSetupId(setupId)) return "Ask your coding assistant for a new setup link.";
  const parsed = parseClientRegistration({ clientName: params.get("client_name"), redirectUris: [params.get("redirect_uri")], confidential: false });
  if (!parsed.ok) return parsed.errors.join(" ");
  return { setupId, clientName: parsed.value.clientName, redirectUri: parsed.value.redirectUris[0]! };
}

export async function appSetupPage(exterior: ExteriorAuth, account: Account, setup: AppSetup): Promise<Extract<AccountPage, { kind: "app-registration" }>> {
  const approval: Approval = { ...setup, userId: account.userId, expiresAt: Date.now() + lifetimeMs };
  const payload = Buffer.from(JSON.stringify(approval)).toString("base64url");
  const signature = createHmac("sha256", (await exterior.auth.$context).secret).update(payload).digest("base64url");
  return {
    kind: "app-registration",
    clientName: setup.clientName,
    redirectUri: setup.redirectUri,
    account: { name: account.userName, image: account.userImage },
    approval: `${payload}.${signature}`,
  };
}

export async function readAppSetupApproval(exterior: ExteriorAuth, token: string): Promise<Approval | undefined> {
  if (token.length > 16_384) return undefined;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return undefined;
  const expected = createHmac("sha256", (await exterior.auth.$context).secret).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return undefined;
  // Only a page signed by this relay can reach here.
  const approval = JSON.parse(Buffer.from(payload, "base64url").toString()) as Approval;
  return approval.expiresAt > Date.now() ? approval : undefined;
}

/** Polling creates no state. Only an account's signed decision leaves a short-lived result. */
export function createAppSetupResults() {
  const results = new Map<string, { setup: Approval; expiresAt: number; outcome?: AppSetupOutcome; pending: Promise<AppSetupOutcome> }>();
  function prune() {
    for (const [id, result] of results) if (result.expiresAt <= Date.now()) results.delete(id);
  }
  return {
    get(setupId: string): AppSetupOutcome | undefined {
      prune();
      return results.get(setupId)?.outcome;
    },
    async decide(setup: Approval, run: () => Promise<AppSetupOutcome>): Promise<AppSetupOutcome> {
      prune();
      const existing = results.get(setup.setupId);
      if (existing) {
        if (existing.setup.userId !== setup.userId || existing.setup.clientName !== setup.clientName || existing.setup.redirectUri !== setup.redirectUri) throw new Error("This setup was already used with different details. Ask your coding assistant for a new setup link.");
        return existing.pending;
      }
      if ([...results.values()].filter((result) => result.setup.userId === setup.userId).length >= 10) throw new Error("Too many recent setups. Wait ten minutes, then ask your coding assistant for a new setup link.");
      const entry = { setup, expiresAt: Date.now() + lifetimeMs, outcome: undefined as AppSetupOutcome | undefined, pending: Promise.resolve().then(run) };
      results.set(setup.setupId, entry);
      try {
        entry.outcome = await entry.pending;
        return entry.outcome;
      } catch (error) {
        results.delete(setup.setupId);
        throw error;
      }
    },
  };
}
