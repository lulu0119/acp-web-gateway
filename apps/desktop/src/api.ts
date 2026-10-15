import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** What `exterior daemon --json` last printed for one relay. */
export type DaemonState = {
  relayUrl: string;
  status: "connecting" | "connected" | "waiting" | "stopped";
  since: number;
  agents: string[];
  message?: string;
};

export type RelayView = {
  relayUrl: string;
  phase: "running" | "restarting" | "signInRequired" | "elsewhere" | "stopped";
  state: DaemonState | null;
  error: string | null;
  retryAt: number | null;
};

export type AgentConfig = { name: string; agentType: string; envNames: string[]; command?: string[] };

export type AgentType = { id: string; name: string; description?: string; ready: boolean; reason?: string };

export type SignInEvent =
  | { event: "code"; relayUrl: string; verificationUri: string; userCode: string; expiresAt: number }
  | { event: "signed-in"; relayUrl: string }
  | { event: "failed"; relayUrl: string; message: string }
  | { event: "ended"; message: string };

export const api = {
  relays: () => invoke<RelayView[]>("relays"),
  deviceName: () => invoke<string>("device_name"),
  agents: async () => (await invoke<{ agents: AgentConfig[] }>("agents")).agents,
  agentTypes: async () => (await invoke<{ types: AgentType[] }>("agent_types")).types,
  createAgent: (agent: { agentType?: string; command?: string; name?: string; env: [string, string][] }) =>
    invoke<void>("create_agent", { agent }),
  removeAgent: (name: string) => invoke<void>("remove_agent", { name }),
  signIn: (relay: string) => invoke<void>("sign_in", { relay }),
  cancelSignIn: () => invoke<void>("cancel_sign_in"),
  signOut: (relay: string) => invoke<void>("sign_out", { relay }),
  startDaemon: (relay: string) => invoke<void>("start_daemon", { relay }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  onRelays: (handler: (views: RelayView[]) => void): Promise<UnlistenFn> =>
    listen<RelayView[]>("relays-changed", (event) => handler(event.payload)),
  onSignIn: (handler: (event: SignInEvent) => void): Promise<UnlistenFn> =>
    listen<SignInEvent>("sign-in", (event) => handler(event.payload)),
};

/** A command's rejection is the text exterior printed on stderr. */
export function errorText(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
