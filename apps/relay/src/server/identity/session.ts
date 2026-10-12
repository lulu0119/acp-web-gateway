import type { MukaeAuth } from "./auth.js";
import { requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";

export type Account = { userId: string; userName: string };

export async function readAccount(request: Request, mukae: MukaeAuth): Promise<Account | undefined> {
  const session = await mukae.auth.api.getSession({ headers: request.headers });
  if (!session) return undefined;
  return { userId: session.session.userId, userName: session.user.name ?? "" };
}

export async function readUserId(
  request: Request,
  input: { jwksUrl: string; issuer: string; audience: string },
): Promise<string | undefined> {
  if (!request.headers.get("authorization")) return undefined;
  try {
    const payload = await verifyAccessTokenRequest(requestToResourceInput(request), {
      jwksUrl: input.jwksUrl,
      verifyOptions: { issuer: input.issuer, audience: input.audience },
      requiredScopes: ["machines"],
    });
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}
