import { hostname } from "node:os";
import { defaultRelayUrl } from "@mukae/contract";
import { signInDaemon } from "../../login.js";
import { readSignIns, chooseRelay } from "../../sign-ins.js";
import { defineCommand } from "../command.js";
import { relayOption, requestedRelay } from "../relay.js";

export const login = defineCommand({
  name: "login",
  description: "Sign this device in to a Mukae relay",
  help: [
    "Sign this device in to a Mukae relay with a device code. Approve the code on the relay after signing in with GitHub. The device then appears on the relay's dashboard.",
    "A device keeps one sign-in per relay. Signing in to a second relay keeps the first. Signing in again to the same relay replaces its sign-in.",
  ].join("\n\n"),
  options: [relayOption],
  examples: [
    "mukae login --relay relay.example.com",
    "# A relay running on this machine\nmukae login --relay 127.0.0.1:8787",
  ],
  async action(context, options) {
    const { io } = context;
    const signedIn = await readSignIns(io.homeDirectory);
    const chosen = chooseRelay({ requested: requestedRelay(context, options), signedIn, command: "login" });
    if (!chosen.ok && signedIn.length > 0) {
      io.stderr.write(`${chosen.message}\n`);
      return 1;
    }
    const relayUrl = chosen.ok ? chosen.relayUrl : defaultRelayUrl;
    io.stdout.write(chosen.ok ? `Signing in to ${relayUrl}.\n` : `Signing in to ${relayUrl}, the default relay. Pass --relay <url> to choose another.\n`);
    try {
      await signInDaemon({ relayUrl, hostname: hostname(), homeDirectory: io.homeDirectory, signal: context.signal, inform: (line) => io.stdout.write(`${line}\n`) });
    } catch (error) {
      if (context.signal?.aborted) return 130;
      io.stderr.write(`${error instanceof Error ? error.message : "Sign-in failed."}\n`);
      if (!chosen.ok) io.stderr.write("Is a relay running there? Pass --relay <url> to sign in to another one.\n");
      return 1;
    }
    const others = signedIn.some((signIn) => signIn.relayUrl !== relayUrl);
    io.stdout.write(`Signed in to ${relayUrl}.\nNext: mukae daemon${others ? ` --relay ${relayUrl}` : ""}\n`);
    return 0;
  },
});
