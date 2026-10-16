import "@vitejs/plugin-react/preamble";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./pages/dashboard";
import { readProps } from "@exterior/ui/props";
import type { DashboardData, SetupGuideData } from "../shared/account-web.js";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
const blank = { code: "", html: "" };
const props = readProps<{ data: DashboardData; guide: SetupGuideData } | undefined>(undefined);
createRoot(root).render(
  <StrictMode>
    <Dashboard
      initialData={props?.data ?? { userName: "", devices: [], sessions: [] }}
      guide={props?.guide ?? { relayUrl: window.location.origin, prompt: blank, commands: blank, afterLogin: blank }}
    />
  </StrictMode>,
);
