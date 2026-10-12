import type { Machine } from "@mukae/contract";

export type LiveSessionInfo = {
  machineId: string;
  agentName: string;
  agentType: string;
};

export type DashboardData = {
  userName: string;
  machines: Machine[];
  sessions: LiveSessionInfo[];
};

export type GrantedApp = {
  clientId: string;
  clientName: string;
  logoUri?: string;
  clientUri?: string;
  scopes: string[];
  grantedAt: string;
};

export type AccountPage =
  | { kind: "sign-in"; query: string; configured: boolean }
  | { kind: "consent"; query: string; clientId: string; clientName: string; redirectUri: string; scope: string }
  | { kind: "device-code" }
  | { kind: "device"; userCode: string }
  | { kind: "message"; title: string; message: string };
