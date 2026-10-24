import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { AccountPage, AccountView, PermissionView } from "../../shared/account-web.js";
import { setupGuide } from "../rendering/setup-guide.js";
import type { ExteriorAuth } from "./auth.js";
import { isLoopbackRedirect } from "./clients.js";
import { findClientMeta } from "./grants.js";
import { readAccount, type Account } from "./session.js";

export type AccountResult =
  | { redirect: string; headers?: Headers }
  | { page: AccountPage; status: 200 | 400 | 502 };

export async function readSignIn(request: Request, exterior: ExteriorAuth, configured: boolean): Promise<AccountResult> {
  const session = await readAccount(request, exterior);
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (session && next) return { redirect: next };
  const query = continuationQuery(request.url);
  if (session && query.includes("client_id=")) return { redirect: `/api/auth/oauth2/authorize?${query}` };
  return { page: { kind: "sign-in", query: next ? new URLSearchParams({ next }).toString() : query, configured }, status: 200 };
}

export async function signInWithGitHub(request: Request, exterior: ExteriorAuth, query: string): Promise<AccountResult> {
  const result = await exterior.auth.api.signInSocial({
    body: { provider: "github", callbackURL: query ? `/sign-in?${query}` : "/", disableRedirect: true },
    headers: request.headers,
    returnHeaders: true,
  });
  if (!result.response.url) return message("Sign in", "GitHub did not return a sign-in address.", 502);
  return { redirect: result.response.url, headers: result.headers };
}

export async function readConsent(request: Request, exterior: ExteriorAuth): Promise<AccountResult> {
  const query = continuationQuery(request.url);
  const secret = (await exterior.auth.$context).secret;
  if (!(await verifyOAuthQueryParams(query, secret))) return expiredApproval(query);
  const params = new URLSearchParams(query);
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "").split(" ").filter((scope) => scope.length > 0);
  // The provider already answers a request an earlier approval covers, so whoever reaches this page
  // is asked: the app wanted `prompt=consent`, or it runs on this computer.
  const account = await readAccount(request, exterior);
  if (!account) return { redirect: `/sign-in?${query}` };
  const meta = clientId ? await findClientMeta(exterior, clientId) : undefined;
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
      logoUri: meta?.logoUri,
      local: isLoopbackRedirect(redirectUri),
      account: accountView(account),
      permissions: describeScopes(scopes),
    },
    status: 200,
  };
}

export async function decideConsent(request: Request, exterior: ExteriorAuth, query: string, accept: boolean): Promise<AccountResult> {
  let result: { redirect: boolean; url: string };
  try {
    result = await exterior.auth.api.oauth2Consent({
      body: { accept, oauth_query: query },
      headers: request.headers,
      request,
      asResponse: false,
    });
  } catch {
    return expiredApproval(query);
  }
  if (!result.redirect) return expiredApproval(query);
  return { redirect: result.url };
}

const scopeDescriptions: Record<string, Omit<PermissionView, "scope">> = {
  "eap:client": {
    title: "Use agents on your devices",
    detail: "See which of your devices are online and start any agent on them, including agents you add later. An agent runs with your permissions on its device.",
  },
  offline_access: {
    title: "Stay connected",
    detail: "Keep this access after you close the page, until you revoke it from your Exterior dashboard.",
  },
  openid: { title: "Know who you are", detail: "Learn your Exterior account id." },
  profile: { title: "See your name", detail: "Read the name on your Exterior account." },
  email: { title: "See your email address", detail: "Read the email address on your Exterior account." },
};

export function describeScopes(scopes: readonly string[]): PermissionView[] {
  return scopes.map((scope) => ({ scope, ...(scopeDescriptions[scope] ?? { title: scope, detail: "A permission Exterior does not describe." }) }));
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

export async function readDevice(request: Request, exterior: ExteriorAuth, userCode: string): Promise<AccountResult> {
  const account = await readAccount(request, exterior);
  if (!account) {
    const next = userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : "/device";
    return { redirect: `/sign-in?next=${encodeURIComponent(next)}` };
  }
  if (!userCode) return { page: { kind: "device-code", account: accountView(account) }, status: 200 };
  try {
    await exterior.auth.api.deviceVerify({ query: { user_code: userCode }, headers: request.headers });
  } catch (error) {
    return { page: { kind: "device-code", account: accountView(account), userCode, problem: described(error) }, status: 400 };
  }
  return { page: { kind: "device", userCode, account: accountView(account) }, status: 200 };
}

export async function decideDevice(request: Request, exterior: ExteriorAuth, userCode: string, approve: boolean): Promise<AccountResult> {
  const account = await readAccount(request, exterior);
  if (!account) return { redirect: `/sign-in?next=${encodeURIComponent(`/device?user_code=${encodeURIComponent(userCode)}`)}` };
  if (!userCode) return { page: { kind: "device-code", account: accountView(account), problem: "Enter the code your device printed." }, status: 400 };
  const endpoint = approve ? exterior.auth.api.deviceApprove : exterior.auth.api.deviceDeny;
  try {
    await endpoint({ body: { userCode }, headers: request.headers });
  } catch (error) {
    return { page: { kind: "device-code", account: accountView(account), userCode, problem: described(error) }, status: 400 };
  }
  if (approve) return { page: { kind: "device-approved", guide: setupGuide(exterior.publicUrl) }, status: 200 };
  return message("Device not connected", "The code was denied. The device stays signed out.", 200, "neutral");
}

function accountView(account: Account): AccountView {
  return { name: account.userName, image: account.userImage };
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
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  const target = new URL(value, "https://exterior.invalid");
  return target.origin === "https://exterior.invalid" ? target.pathname + target.search + target.hash : undefined;
}
