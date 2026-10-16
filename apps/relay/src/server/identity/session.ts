import type { Access } from "../http.js";
import type { ExteriorAuth } from "./auth.js";
import { requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";

/** `userImage` is the avatar GitHub reported at sign-in, when it reported one. */
export type Account = { userId: string; userName: string; userImage?: string };

export async function readAccount(request: Request, exterior: ExteriorAuth): Promise<Account | undefined> {
  const session = await exterior.auth.api.getSession({ headers: request.headers });
  if (!session) return undefined;
  return { userId: session.session.userId, userName: session.user.name ?? "", userImage: session.user.image ?? undefined };
}

export async function readAccess(
  request: Request,
  input: { jwksUrl: string; issuer: string; audience: string },
): Promise<Access | undefined> {
  if (!request.headers.get("authorization")) return undefined;
  try {
    const payload = await verifyAccessTokenRequest(requestToResourceInput(request), {
      jwksUrl: input.jwksUrl,
      verifyOptions: { issuer: input.issuer, audience: input.audience },
      requiredScopes: ["devices"],
    });
    if (typeof payload.sub !== "string" || typeof payload.azp !== "string") return undefined;
    return { userId: payload.sub, clientId: payload.azp };
  } catch {
    return undefined;
  }
}
