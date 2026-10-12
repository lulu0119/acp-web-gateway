import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { AccountPage, PermissionView } from "../../shared/account-web.js";
import { setupGuide } from "../rendering/setup-guide.js";
import type { MukaeAuth } from "./auth.js";
import { approvePendingClient } from "./clients.js";
import { findClientMeta, hasRememberedGrant } from "./grants.js";
import { readAccount } from "./session.js";

export type AccountResult =
  | { redirect: string; headers?: Headers }
  | { page: AccountPage; status: 200 | 400 | 502 };

export async function readSignIn(request: Request, mukae: MukaeAuth, configured: boolean): Promise<AccountResult> {
  const session = await readAccount(request, mukae);
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (session && next) return { redirect: next };
  const query = continuationQuery(request.url);
  if (session && query.includes("client_id=")) return { redirect: `/api/auth/oauth2/authorize?${query}` };
  return { page: { kind: "sign-in", query, configured }, status: 200 };
}

export async function signInWithGitHub(request: Request, mukae: MukaeAuth, query: string): Promise<AccountResult> {
  const result = await mukae.auth.api.signInSocial({
    body: { provider: "github", callbackURL: query ? `/sign-in?${query}` : "/", disableRedirect: true },
    headers: request.headers,
    returnHeaders: true,
  });
  if (!result.response.url) return message("Sign in", "GitHub did not return a sign-in address.", 502);
  return { redirect: result.response.url, headers: result.headers };
}

export async function readConsent(request: Request, mukae: MukaeAuth): Promise<AccountResult> {
  const query = continuationQuery(request.url);
  const secret = (await mukae.auth.$context).secret;
  if (!(await verifyOAuthQueryParams(query, secret))) return expiredApproval(query);
  const params = new URLSearchParams(query);
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "").split(" ").filter((scope) => scope.length > 0);
  const account = await readAccount(request, mukae);
  if (!account) return { redirect: `/sign-in?${query}` };
  if (clientId && (await hasRememberedGrant(mukae, account, clientId, scopes))) {
    const approved = await mukae.auth.api.oauth2Consent({
      body: { accept: true, oauth_query: query },
      headers: request.headers,
      request,
      asResponse: false,
    }).catch(() => undefined);
    if (approved?.redirect) return { redirect: approved.url };
  }
  const meta = clientId ? await findClientMeta(mukae, clientId) : undefined;
  const redirectUri = params.get("redirect_uri") ?? "";
  return {
    page: {
      kind: "consent",
      query,
      clientId,
      clientName: meta?.clientName ?? "",
      origin: originOf(redirectUri),
      redirectUri,
      clientUri: meta?.clientUri,
      unverified: !meta?.registered,
      accountName: account.userName,
      permissions: describeScopes(scopes),
    },
    status: 200,
  };
}

export async function decideConsent(request: Request, mukae: MukaeAuth, query: string, accept: boolean): Promise<AccountResult> {
  let result: { redirect: boolean; url: string };
  try {
    result = await mukae.auth.api.oauth2Consent({
      body: { accept, oauth_query: query },
      headers: request.headers,
      request,
      asResponse: false,
    });
  } catch {
    return expiredApproval(query);
  }
  if (!result.redirect) return expiredApproval(query);
  const clientId = new URLSearchParams(query).get("client_id") ?? "";
  if (accept && clientId && (await approvePendingClient(mukae, clientId))) {
    const back = new URL(result.url);
    back.searchParams.set("client_id", clientId);
    return { redirect: back.href };
  }
  return { redirect: result.url };
}

const scopeDescriptions: Record<string, Omit<PermissionView, "scope">> = {
  machines: {
    title: "Use agents on your devices",
    detail: "See which of your devices are online and the agents set up on them, and start a session with one of those agents.",
  },
  offline_access: {
    title: "Stay connected",
    detail: "Keep this access after you close the page, until you revoke it from your Mukae dashboard.",
  },
  openid: { title: "Know who you are", detail: "Learn your Mukae account id." },
  profile: { title: "See your name", detail: "Read the name on your Mukae account." },
  email: { title: "See your email address", detail: "Read the email address on your Mukae account." },
};

export function describeScopes(scopes: readonly string[]): PermissionView[] {
  return scopes.map((scope) => ({ scope, ...(scopeDescriptions[scope] ?? { title: scope, detail: "A permission Mukae does not describe." }) }));
}

const signingParams = new Set(["sig", "exp"]);

// The signed approval link expires. The original request (client, redirect, state, PKCE challenge) is still valid,
// so sending it to the authorize endpoint again issues a fresh link without involving the app.
function expiredApproval(query: string): AccountResult {
  const restart = new URLSearchParams([...new URLSearchParams(query)].filter(([key]) => !signingParams.has(key) && !key.startsWith("ba_")));
  const canRestart = restart.has("client_id") && restart.has("redirect_uri");
  return {
    page: {
      kind: "message",
      tone: "error",
      title: "This approval link expired",
      message: canRestart
        ? "Approval links last a few minutes. Start again to get a fresh one; the app keeps waiting."
        : "Approval links last a few minutes. Go back to the app and connect again.",
      action: canRestart ? { label: "Start again", href: `/api/auth/oauth2/authorize?${restart}` } : undefined,
    },
    status: 400,
  };
}

function originOf(uri: string): string {
  try {
    return new URL(uri).origin;
  } catch {
    return "";
  }
}

export async function readDevice(request: Request, mukae: MukaeAuth, userCode: string): Promise<AccountResult> {
  const account = await readAccount(request, mukae);
  if (!account) {
    const next = userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : "/device";
    return { redirect: `/sign-in?next=${encodeURIComponent(next)}` };
  }
  if (!userCode) return { page: { kind: "device-code", accountName: account.userName }, status: 200 };
  try {
    await mukae.auth.api.deviceVerify({ query: { user_code: userCode }, headers: request.headers });
  } catch (error) {
    return { page: { kind: "device-code", accountName: account.userName, userCode, problem: described(error) }, status: 400 };
  }
  return { page: { kind: "device", userCode, accountName: account.userName }, status: 200 };
}

export async function decideDevice(request: Request, mukae: MukaeAuth, userCode: string, approve: boolean): Promise<AccountResult> {
  const account = await readAccount(request, mukae);
  if (!account) return { redirect: `/sign-in?next=${encodeURIComponent(`/device?user_code=${encodeURIComponent(userCode)}`)}` };
  if (!userCode) return { page: { kind: "device-code", accountName: account.userName, problem: "Enter the code your device printed." }, status: 400 };
  const endpoint = approve ? mukae.auth.api.deviceApprove : mukae.auth.api.deviceDeny;
  try {
    await endpoint({ body: { userCode }, headers: request.headers });
  } catch (error) {
    return { page: { kind: "device-code", accountName: account.userName, userCode, problem: described(error) }, status: 400 };
  }
  if (approve) return { page: { kind: "device-approved", guide: setupGuide(mukae.publicUrl) }, status: 200 };
  return message("Device not connected", "The code was denied. The device stays signed out.", 200, "neutral");
}

function message(title: string, message: string, status: 200 | 400 | 502, tone: "success" | "neutral" | "error" = "error"): AccountResult {
  return { page: { kind: "message", tone, title, message }, status };
}

function continuationQuery(requestUrl: string): string {
  const query = new URL(requestUrl).search.slice(1);
  return query.startsWith("next=") ? "" : query;
}

function described(error: unknown): string {
  if (typeof error === "object" && error !== null && "body" in error) {
    const body = error.body;
    if (typeof body === "object" && body !== null && "error_description" in body && typeof body.error_description === "string") {
      return body.error_description;
    }
  }
  return "That code did not work";
}

function safeNext(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}
