import type { StatusObservation } from "./choose-connect-action.js";

/** The first candidate port with no gateway answering on it. */
export async function pickFreeGatewayPort(input: {
  candidates: readonly number[];
  readStatus: (port: number) => Promise<StatusObservation>;
}): Promise<number | undefined> {
  for (const port of input.candidates) {
    if ((await input.readStatus(port)) === "unreachable") return port;
  }
  return undefined;
}
