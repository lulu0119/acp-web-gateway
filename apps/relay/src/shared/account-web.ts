import type { AgentSlot } from "@mukae/contract";

export type LiveSessionInfo = {
  machineId: string;
  agentName: string;
  agentType: string;
};

/** A signed-in device as the dashboard shows it. `machineId` is set while its daemon is connected. */
export type DeviceView = {
  id: string;
  hostname: string;
  machineId?: string;
  agents: readonly AgentSlot[];
  /** Milliseconds since the epoch; absent for a daemon too old to announce a device id. */
  lastSeenAt?: number;
};

export type DashboardData = {
  userName: string;
  devices: DeviceView[];
  sessions: LiveSessionInfo[];
};

/** Code highlighted on the server, so pages ship HTML instead of a highlighter. */
export type HighlightedCode = { code: string; html: string };

/** How to connect a device: a prompt for an AI assistant, the same steps as shell commands, and what follows sign-in. */
export type SetupGuideData = {
  relayUrl: string;
  prompt: HighlightedCode;
  commands: HighlightedCode;
  afterLogin: HighlightedCode;
};

export type GrantedApp = {
  clientId: string;
  clientName: string;
  clientUri?: string;
  scopes: string[];
  grantedAt: string;
};

/** A permission named for a person, derived from one OAuth scope. */
export type PermissionView = { scope: string; title: string; detail: string };

export type AccountPage =
  | { kind: "sign-in"; query: string; configured: boolean }
  | {
    kind: "consent";
    query: string;
    clientId: string;
    clientName: string;
    /** The origin the app returns to: where it runs. */
    origin: string;
    redirectUri: string;
    clientUri?: string;
    /** True when the name came from the app itself rather than from an account that registered it. */
    unverified: boolean;
    accountName: string;
    permissions: PermissionView[];
  }
  | { kind: "device-code"; accountName: string; userCode?: string; problem?: string }
  | { kind: "device"; userCode: string; accountName: string }
  | { kind: "device-approved"; guide: SetupGuideData }
  | { kind: "message"; tone: "success" | "neutral" | "error"; title: string; message: string; action?: { label: string; href: string } };
