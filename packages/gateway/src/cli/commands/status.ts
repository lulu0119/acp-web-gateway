import { readSignIns } from "../../sign-ins.js";
import { defineCommand } from "../command.js";

export const status = defineCommand({
  name: "status",
  description: "List the relays this machine is signed in to",
  async action({ io }) {
    const signedIn = await readSignIns(io.homeDirectory);
    if (signedIn.length === 0) {
      io.stdout.write("This machine is not signed in. Run mukae login --relay <url>.\n");
      return 0;
    }
    for (const signIn of signedIn) io.stdout.write(`Signed in to ${signIn.relayUrl}\n`);
    return 0;
  },
});
