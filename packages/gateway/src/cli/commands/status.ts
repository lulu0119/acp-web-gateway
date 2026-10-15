import { readDaemonState, type DaemonState } from "../../daemon-state.js";
import { readSignIns } from "../../sign-ins.js";
import { defineCommand } from "../command.js";

export const status = defineCommand({
  name: "status",
  description: "List the relays this device is signed in to, and each one's daemon",
  help: [
    "List the relays this device is signed in to. For each one, say whether its daemon is connected, retrying, or stopped, and why it stopped.",
    "--json prints the same as one JSON document, for the desktop app and scripts.",
  ].join("\n\n"),
  options: [{ flags: "--json", description: "Print JSON" }],
  examples: ["exterior status", "exterior status --json"],
  async action({ io }, options) {
    const signedIn = await readSignIns(io.homeDirectory);
    const relays = await Promise.all(
      signedIn.map(async (signIn) => ({ relayUrl: signIn.relayUrl, daemon: (await readDaemonState(signIn.relayUrl, io.homeDirectory)) ?? null })),
    );
    if (options.json) {
      io.stdout.write(`${JSON.stringify({ relays }, null, 2)}\n`);
      return 0;
    }
    if (relays.length === 0) {
      io.stdout.write("This device is not signed in. Run exterior login --relay <url>.\n");
      return 0;
    }
    for (const relay of relays) io.stdout.write(`Signed in to ${relay.relayUrl}${relay.daemon ? `. ${describe(relay.daemon)}` : ""}\n`);
    return 0;
  },
});

function describe(daemon: DaemonState): string {
  const agents = daemon.agents.length > 0 ? daemon.agents.join(", ") : "none";
  if (daemon.status === "connected") return `Daemon connected, offering ${agents}.`;
  if (daemon.status === "connecting") return "Daemon connecting.";
  if (daemon.status === "waiting") return "Daemon waiting to reconnect.";
  return `Daemon stopped: ${daemon.message ?? "no reason given."}`;
}
