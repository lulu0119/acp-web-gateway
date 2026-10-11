import type { MukaeAuth } from "./auth.js";

export type Account = { userId: string; userName: string };

export async function readAccount(request: Request, mukae: MukaeAuth): Promise<Account | undefined> {
  const session = await mukae.auth.api.getSession({ headers: request.headers });
  if (!session) return undefined;
  return { userId: session.session.userId, userName: session.user.name ?? "" };
}
