import { defaultRelayUrl } from "@mukae/contract";

export function mukaeRelayUrl(): string {
  const configured = import.meta.env.VITE_MUKAE_URL;
  if (!configured) return defaultRelayUrl;
  try {
    return new URL(configured).origin;
  } catch {
    return defaultRelayUrl;
  }
}
