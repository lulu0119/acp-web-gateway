import type { RelayView } from "./api";

export type Tone = "ok" | "busy" | "attention" | "off";

/** What one relay row says: a short label, the reason under it, and the action that helps. */
export type RelayStatus = { tone: Tone; label: string; detail: string; action?: "sign-in" | "start" };

export function relayStatus(view: RelayView, now: number): RelayStatus {
  switch (view.phase) {
    case "signInRequired":
      return { tone: "attention", label: "Sign in again", detail: view.error ?? "The relay no longer accepts this device's sign-in.", action: "sign-in" };
    case "elsewhere":
      return { tone: "off", label: "Served elsewhere", detail: "Another exterior daemon, started outside this app, serves this relay. The app takes over when it stops." };
    case "stopped":
      return { tone: "off", label: "Stopped", detail: view.error ?? "The daemon is not running.", action: "start" };
    case "restarting": {
      const seconds = view.retryAt ? Math.max(0, Math.ceil((view.retryAt - now) / 1000)) : 0;
      const when = seconds > 0 ? `Restarting in ${seconds}s` : "Restarting";
      return { tone: "attention", label: when, detail: view.error ?? "The daemon stopped unexpectedly." };
    }
    case "running": {
      const offering = view.state?.agents.length ? `Offering ${view.state.agents.join(", ")}.` : "Offering no agents yet.";
      if (view.state?.status === "connected") return { tone: "ok", label: "Connected", detail: offering };
      if (view.state?.status === "waiting") return { tone: "busy", label: "Reconnecting", detail: "The relay is not answering. Trying again." };
      return { tone: "busy", label: "Connecting", detail: offering };
    }
  }
}

export function relayHost(relayUrl: string): string {
  try {
    return new URL(relayUrl).host;
  } catch {
    return relayUrl;
  }
}
