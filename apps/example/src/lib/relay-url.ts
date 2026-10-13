import { defaultRelayUrl } from "@exterior/contract";

export function exteriorRelayUrl(): string {
  const configured = import.meta.env.VITE_EXTERIOR_URL;
  if (!configured) return defaultRelayUrl;
  try {
    return new URL(configured).origin;
  } catch {
    return defaultRelayUrl;
  }
}
