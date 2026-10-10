import type { GatewayStatus } from "@mukae/contract";

export type StatusObservation = GatewayStatus | "unreachable" | "rejected";

export type ConnectAction =
  | { type: "wait" }
  | { type: "open-socket" }
  | { type: "unconfigured" }
  | { type: "cancelled" }
  | { type: "documentation"; url: string };

export function chooseConnectAction(input: {
  observation: StatusObservation;
  elapsedMs: number;
  readyTimeoutMs: number;
  documentationUrl: string;
}): ConnectAction {
  if (input.observation === "waiting") return { type: "open-socket" };
  if (input.observation === "unconfigured") return { type: "unconfigured" };
  if (input.observation === "cancelled") return { type: "cancelled" };
  if (input.observation === "choosing") return { type: "wait" };
  if (input.observation === "rejected" || input.elapsedMs >= input.readyTimeoutMs) {
    return { type: "documentation", url: input.documentationUrl };
  }
  return { type: "wait" };
}
