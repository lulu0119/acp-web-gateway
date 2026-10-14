import { chooseRelay, readSignIns, type SignIn } from "../sign-ins.js";
import { stringOption, UsageError, type CommandContext, type CommandOptions } from "./command.js";

export const relayOption = {
  flags: "--relay <url>",
  description: "Exterior relay address; a bare host means https. Defaults to EXTERIOR_RELAY, then the only sign-in",
};

/** Reads a relay origin. A bare host means https, except a loopback host, which means http. */
export function parseRelayUrl(text: string): string | undefined {
  if (text.startsWith("--")) return undefined;
  const loopback = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/.test(text);
  if (!text.includes("://") && !loopback && !/^[\w-]+(\.[\w-]+)+(:\d+)?$/.test(text)) return undefined;
  try {
    const url = new URL(text.includes("://") ? text : `${loopback ? "http" : "https"}://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** The relay named by `--relay`, then by `EXTERIOR_RELAY`. */
export function requestedRelay(context: CommandContext, options: CommandOptions): string | undefined {
  const flag = stringOption(options, "relay");
  if (flag !== undefined) {
    const relayUrl = parseRelayUrl(flag);
    if (!relayUrl) throw new UsageError(`--relay is not a relay address: ${flag}`);
    return relayUrl;
  }
  const environment = context.io.env.EXTERIOR_RELAY;
  if (!environment) return undefined;
  const relayUrl = parseRelayUrl(environment);
  if (!relayUrl) throw new UsageError(`EXTERIOR_RELAY is not a relay address: ${environment}`);
  return relayUrl;
}

/** The relay a command acts on, or a message that says how to pick one. */
export async function resolveRelay(
  context: CommandContext,
  options: CommandOptions,
  command: string,
): Promise<{ ok: true; relayUrl: string; signedIn: SignIn[] } | { ok: false; message: string }> {
  const signedIn = await readSignIns(context.io.homeDirectory);
  const chosen = chooseRelay({ requested: requestedRelay(context, options), signedIn, command });
  return chosen.ok ? { ...chosen, signedIn } : chosen;
}
