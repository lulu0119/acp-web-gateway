import type { Machine } from "@mukae/contract";
import type { LiveSessionInfo } from "./registry.js";

export type DashboardData = {
  userName: string;
  machines: Machine[];
  sessions: LiveSessionInfo[];
};
