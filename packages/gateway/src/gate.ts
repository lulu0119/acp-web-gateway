import type { GatewayStatus } from "@mukae/contract";

export function admitConnection(input: {
  expectedNonce: string;
  expectedOrigin: string;
  nonce: string | null;
  origin: string | null;
}): { accept: true } | { accept: false } {
  if (input.nonce === input.expectedNonce && input.origin === input.expectedOrigin) {
    return { accept: true };
  }
  return { accept: false };
}

export function statusForOrigin(input: {
  expectedOrigin: string;
  origin: string | null;
  gatewayStatus: GatewayStatus;
}): GatewayStatus | "rejected" {
  if (input.origin !== input.expectedOrigin) return "rejected";
  return input.gatewayStatus;
}
