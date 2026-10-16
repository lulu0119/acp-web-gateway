import { hashToken, type ExteriorAuth } from "./auth.js";

type StoredRefreshToken = {
  id: string;
  clientId: string;
  userId?: string | null;
  expiresAt: Date | string;
  revoked?: Date | string | null;
};

/**
 * Stamps a device id on the daemon sign-in a refresh token belongs to. A refresh carries the stamp to
 * the next token, so removing the device later finds whichever token the daemon holds by then.
 * Answers false when the token is not a live daemon sign-in of the account.
 */
export async function bindDeviceToken(exterior: ExteriorAuth, input: {
  userId: string;
  clientId: string;
  deviceId: string;
  refreshToken: string;
}): Promise<boolean> {
  const context = await exterior.auth.$context;
  const row = await context.adapter.findOne<StoredRefreshToken>({
    model: "oauthRefreshToken",
    where: [{ field: "token", value: hashToken(input.refreshToken) }],
  });
  if (!row || row.userId !== input.userId || row.clientId !== input.clientId || row.revoked) return false;
  if (new Date(row.expiresAt).getTime() <= Date.now()) return false;
  await context.adapter.update({
    model: "oauthRefreshToken",
    where: [{ field: "id", value: row.id }],
    update: { referenceId: input.deviceId },
  });
  return true;
}

/**
 * Deletes every daemon token stamped with the device id. Deleted rather than marked revoked: the
 * provider answers a replayed revoked token by revoking every daemon sign-in of the account.
 */
export async function deleteDeviceTokens(exterior: ExteriorAuth, input: { userId: string; clientId: string; deviceId: string }): Promise<void> {
  const context = await exterior.auth.$context;
  await context.adapter.deleteMany({
    model: "oauthRefreshToken",
    where: [
      { field: "userId", value: input.userId },
      { field: "clientId", value: input.clientId },
      { field: "referenceId", value: input.deviceId },
    ],
  });
}
