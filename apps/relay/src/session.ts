import { requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";

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
