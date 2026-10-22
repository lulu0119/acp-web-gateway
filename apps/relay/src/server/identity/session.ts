import type { Access } from "../http.js";
import type { ExteriorAuth } from "./auth.js";
import { getConfirmationJkt, requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";

/** `userImage` is the avatar GitHub reported at sign-in, when it reported one. */
export type Account = { userId: string; userName: string; userImage?: string };

export async function readAccount(request: Request, exterior: ExteriorAuth): Promise<Account | undefined> {
  const session = await exterior.auth.api.getSession({ headers: request.headers });
  if (!session) return undefined;
  return { userId: session.session.userId, userName: session.user.name ?? "", userImage: session.user.image ?? undefined };
}

/**
 * Reads a bearer or DPoP-bound access token (RFC 9449). A DPoP proof names the address the caller dialed, which is
 * the relay's public address even behind a proxy, so the request is checked against that.
 */
export async function readAccess(
  request: Request,
  input: { jwksUrl: string; issuer: string; audience: string; publicUrl: string },
): Promise<Access | undefined> {
  if (!request.headers.get("authorization")) return undefined;
  try {
    const url = new URL(request.url);
    const payload = await verifyAccessTokenRequest({ ...requestToResourceInput(request), url: new URL(url.pathname, input.publicUrl).href }, {
      jwksUrl: input.jwksUrl,
      verifyOptions: { issuer: input.issuer, audience: input.audience },
    });
    if (typeof payload.sub !== "string" || typeof payload.azp !== "string") return undefined;
    const scopes = typeof payload.scope === "string" ? payload.scope.split(" ").filter((scope) => scope.length > 0) : [];
    return { userId: payload.sub, clientId: payload.azp, scopes, deviceId: getConfirmationJkt(payload.cnf) };
  } catch {
    return undefined;
  }
}
