import { removeSignIn } from "../../sign-ins.js";
import { defineCommand } from "../command.js";
import { relayOption, resolveRelay } from "../relay.js";

export const logout = defineCommand({
  name: "logout",
  description: "Remove this machine's sign-in for a relay",
  help: "Remove this machine's sign-in for a relay. The refresh token is deleted here and is not revoked on the relay.",
  options: [relayOption],
  async action(context, options) {
    const { io } = context;
    const chosen = await resolveRelay(context, options, "logout");
    if (!chosen.ok) {
      io.stderr.write(`${chosen.message}\n`);
      return 1;
    }
    if (!chosen.signedIn.some((signIn) => signIn.relayUrl === chosen.relayUrl)) {
      io.stderr.write(`This machine is not signed in to ${chosen.relayUrl}.\n`);
      return 1;
    }
    await removeSignIn(chosen.relayUrl, io.homeDirectory);
    io.stdout.write(`Signed out of ${chosen.relayUrl}.\n`);
    return 0;
  },
});
