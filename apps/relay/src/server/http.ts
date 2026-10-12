import { createMiddleware } from "hono/factory";

export type RelayEnv = { Variables: { userId: string; clientId: string } };

/** Who an access token speaks for: the account, and the OAuth client it was issued to. */
export type Access = { userId: string; clientId: string };
export type ReadAccess = (request: Request) => Promise<Access | undefined>;

/**
 * Requires an access token. `clients` decides which OAuth clients may use the route: the daemon's tokens only reach
 * the daemon socket, and web app tokens only reach the web app API, so neither can stand in for the other.
 */
export function accessAccount(readAccess: ReadAccess, clients: (clientId: string) => boolean, response: "json" | "text" = "json") {
  return createMiddleware<RelayEnv>(async (c, next) => {
    const access = await readAccess(c.req.raw);
    if (!access) {
      return response === "text" ? c.text("Unauthorized", 401) : c.json({ message: "Sign in again." }, 401);
    }
    if (!clients(access.clientId)) {
      return response === "text" ? c.text("Forbidden", 403) : c.json({ message: "This app cannot use this address." }, 403);
    }
    c.set("userId", access.userId);
    c.set("clientId", access.clientId);
    await next();
  });
}
