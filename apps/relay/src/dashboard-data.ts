import type { Machine } from "@mukae/contract";
import type { LiveSessionInfo } from "./registry.js";

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

export type ClientMeta = {
  clientId: string;
  clientName: string;
  logoUri?: string;
  clientUri?: string;
};
