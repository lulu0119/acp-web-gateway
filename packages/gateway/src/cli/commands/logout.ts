import { fetchPublicClients, revokeRefreshToken } from "@exterior/client";
import { removeSignIn } from "../../sign-ins.js";
import { defineCommand } from "../command.js";
import { relayOption, resolveRelay } from "../relay.js";

export const logout = defineCommand({
  name: "logout",
  description: "Sign this device out of a relay",
  help: [
    "Revoke this device's sign-in on the relay and delete it here. The device keeps its id, so signing in again lists the same device.",
    "When the relay cannot be reached, the sign-in is still deleted here and the refresh token stays valid on the relay until it expires. Removing the device from the dashboard revokes it.",
  ].join("\n\n"),
  options: [relayOption],
  async action(context, options) {
    const { io } = context;
    const chosen = await resolveRelay(context, options, "logout");
    if (!chosen.ok) {
      io.stderr.write(`${chosen.message}\n`);
      return 1;
    }
    const signIn = chosen.signedIn.find((item) => item.relayUrl === chosen.relayUrl);
    if (!signIn) {
      io.stderr.write(`This device is not signed in to ${chosen.relayUrl}.\n`);
      return 1;
    }
    const signal = AbortSignal.timeout(10_000);
    const revoked = await fetchPublicClients(signIn.relayUrl, signal)
      .then((clients) => revokeRefreshToken({ relayUrl: signIn.relayUrl, clientId: clients.daemonClientId, refreshToken: signIn.refreshToken, signal }))
      .then(() => undefined, (error: unknown) => (error instanceof Error ? error.message : "no reason given"));
    await removeSignIn(chosen.relayUrl, io.homeDirectory);
    if (revoked !== undefined) {
      io.stderr.write(`Could not revoke the sign-in on the relay: ${revoked} Deleted it here; remove the device from the dashboard to revoke it.\n`);
    }
    io.stdout.write(`Signed out of ${chosen.relayUrl}.\n`);
    return 0;
  },
});
