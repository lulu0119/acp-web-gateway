import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { AccountPage } from "../../shared/account-web.js";
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
  if (!(await verifyOAuthQueryParams(query, secret))) return message("Approve", "This approval link is no longer valid.", 400);
  const params = new URLSearchParams(query);
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "").split(" ").filter((scope) => scope.length > 0);
  const account = await readAccount(request, mukae);
  if (account && clientId && (await hasRememberedGrant(mukae, account, clientId, scopes))) {
    const approved = await mukae.auth.api.oauth2Consent({
      body: { accept: true, oauth_query: query },
      headers: request.headers,
      request,
      asResponse: false,
    });
    if (approved.redirect) return { redirect: approved.url };
  }
  const meta = clientId ? await findClientMeta(mukae, clientId) : undefined;
  return {
    page: {
      kind: "consent",
      query,
      clientId,
      clientName: meta?.clientName ?? clientId,
      redirectUri: params.get("redirect_uri") ?? "",
      scope: params.get("scope") ?? "",
    },
    status: 200,
  };
}

export async function decideConsent(request: Request, mukae: MukaeAuth, query: string, accept: boolean): Promise<AccountResult> {
  const result = await mukae.auth.api.oauth2Consent({
    body: { accept, oauth_query: query },
    headers: request.headers,
    request,
    asResponse: false,
  });
  if (!result.redirect) return message("Approve", "Mukae could not finish approval.", 502);
  const clientId = new URLSearchParams(query).get("client_id") ?? "";
  if (accept && clientId && (await approvePendingClient(mukae, clientId))) {
    const back = new URL(result.url);
    back.searchParams.set("client_id", clientId);
    return { redirect: back.href };
  }
  return { redirect: result.url };
}

export async function readDevice(request: Request, mukae: MukaeAuth, userCode: string): Promise<AccountResult> {
  if (!(await readAccount(request, mukae))) {
    const next = userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : "/device";
    return { redirect: `/sign-in?next=${encodeURIComponent(next)}` };
  }
  if (!userCode) return { page: { kind: "device-code" }, status: 200 };
  try {
    await mukae.auth.api.deviceVerify({ query: { user_code: userCode }, headers: request.headers });
  } catch (error) {
    return message("Approve machine", described(error), 400);
  }
  return { page: { kind: "device", userCode }, status: 200 };
}

export async function decideDevice(request: Request, mukae: MukaeAuth, userCode: string, approve: boolean): Promise<AccountResult> {
  if (!userCode) return message("Approve machine", "Enter the code from the machine.", 400);
  const endpoint = approve ? mukae.auth.api.deviceApprove : mukae.auth.api.deviceDeny;
  try {
    await endpoint({ body: { userCode }, headers: request.headers });
  } catch (error) {
    return message("Approve machine", described(error), 400);
  }
  return message(
    approve ? "Machine approved" : "Machine denied",
    approve ? "Return to the machine. It will connect on its own." : "The machine was not approved.",
    200,
  );
}

function message(title: string, message: string, status: 200 | 400 | 502): AccountResult {
  return { page: { kind: "message", title, message }, status };
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
  return "Mukae could not finish approval.";
}

function safeNext(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}
