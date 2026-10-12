import { createMiddleware } from "hono/factory";

export type RelayEnv = { Variables: { userId: string } };
export type ReadUserId = (request: Request) => Promise<string | undefined>;

export function accessAccount(readUserId: ReadUserId, response: "json" | "text" = "json") {
  return createMiddleware<RelayEnv>(async (c, next) => {
    const userId = await readUserId(c.req.raw);
    if (!userId) {
      return response === "text" ? c.text("Unauthorized", 401) : c.json({ message: "Sign in again." }, 401);
    }
    c.set("userId", userId);
    await next();
  });
}
