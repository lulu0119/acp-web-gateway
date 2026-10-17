import type { AgentSlot, DevicePlatform } from "@exterior/contract";

export type LiveSessionInfo = {
  deviceId: string;
  agentName: string;
  agentType: string;
  /** The web app that opened the session; Authorized apps names it. */
  clientId: string;
};

/** A signed-in device as the dashboard shows it. `online` while its daemon is connected; `agents` only then. */
export type DeviceView = {
  id: string;
  hostname: string;
  /** Absent when its daemon never reported one. */
  platform?: DevicePlatform;
  online: boolean;
  agents: readonly AgentSlot[];
  /** Milliseconds since the epoch. */
  lastSeenAt: number;
};

/** The signed-in person, as account pages show them. */
export type AccountView = { name: string; image?: string };

export type DashboardData = {
  userName: string;
  userImage?: string;
  devices: DeviceView[];
  sessions: LiveSessionInfo[];
};

/** Code highlighted on the server, so pages ship HTML instead of a highlighter. */
export type HighlightedCode = { code: string; html: string };

/** A desktop app installer from the latest release. */
export type DesktopDownload = { platform: string; detail: string; href: string };

/**
 * How to connect a device: the desktop app, a prompt for an AI assistant, the same steps as shell
 * commands, and what follows sign-in.
 */
export type SetupGuideData = {
  relayUrl: string;
  /** The installer for the computer the browser runs on, when its user agent names one the release builds. */
  download?: DesktopDownload;
  /** The latest release, which lists every platform. */
  releaseUrl: string;
  prompt: HighlightedCode;
  commands: HighlightedCode;
  afterLogin: HighlightedCode;
};

export type GrantedApp = {
  clientId: string;
  clientName: string;
  /** The logo the app names; the browser loads it from there. */
  logoUri?: string;
  /** The origin the app returns to: where it runs. */
  origin?: string;
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
    /** The logo the app names; the browser loads it from there. */
    logoUri?: string;
    /** True when the name came from the app itself rather than from an account that registered it. */
    unverified: boolean;
    account: AccountView;
    permissions: PermissionView[];
  }
  | { kind: "device-code"; account: AccountView; userCode?: string; problem?: string }
  | { kind: "device"; userCode: string; account: AccountView }
  | { kind: "device-approved"; guide: SetupGuideData }
  | { kind: "message"; tone: "success" | "neutral" | "error"; title: string; message: string; action?: { label: string; href: string } };
