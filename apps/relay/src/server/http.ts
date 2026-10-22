import { createMiddleware } from "hono/factory";

/** `deviceId` is the key a device proved; `signedIn`, whether its account still has a sign-in for it. */
export type RelayEnv = { Variables: { userId: string; clientId: string; deviceId: string | undefined; signedIn: boolean } };

/**
 * Addresses the request at the relay's canonical origin. A proxy ends TLS and forwards plain HTTP,
 * so the container sees an http:// address while discovery and DPoP proofs name the public origin;
 * better-auth checks a proof's htu against the address it sees and would refuse every proof behind
 * a proxy. The relay has one canonical origin, so this keeps the request it was given otherwise.
 */
export function publicRequest(request: Request, publicUrl: string): Request {
  const url = new URL(request.url);
  const canonical = new URL(publicUrl);
  if (url.origin === canonical.origin) return request;
  url.protocol = canonical.protocol;
  url.hostname = canonical.hostname;
  url.port = canonical.port;
  return new Request(url, request);
}

/**
 * Who an access token speaks for: the account, the OAuth client it was issued to, and its scopes. `deviceId` is the
 * thumbprint of the key a DPoP-bound token is bound to, which the request proved it holds.
 */
export type Access = { userId: string; clientId: string; scopes: readonly string[]; deviceId?: string };
export type ReadAccess = (request: Request) => Promise<Access | undefined>;

/**
 * Requires an access token with `scope`. A client's token reaches only the client endpoints and a device's
 * only the device socket, so neither can stand in for the other. A missing or dead token is answered with
 * where to find the authorization server (RFC 9728).
 */
export function accessAccount(input: { readAccess: ReadAccess; resourceMetadataUrl: string }, scope: string) {
  return createMiddleware<RelayEnv>(async (c, next) => {
    const access = await input.readAccess(c.req.raw);
    if (!access) {
      c.header("WWW-Authenticate", `Bearer resource_metadata="${input.resourceMetadataUrl}"`);
      return c.json({ code: "unauthorized", message: "Sign in again." }, 401);
    }
    if (!access.scopes.includes(scope)) {
      c.header("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${input.resourceMetadataUrl}"`);
      return c.json({ code: "insufficient_scope", message: "This token cannot use this address." }, 403);
    }
    c.set("userId", access.userId);
    c.set("clientId", access.clientId);
    c.set("deviceId", access.deviceId);
    await next();
  });
}
