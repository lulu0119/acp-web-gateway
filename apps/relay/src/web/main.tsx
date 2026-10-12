import "@vitejs/plugin-react/preamble";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./pages/dashboard";
import { readProps } from "./lib/props";
import type { DashboardData } from "../shared/account-web.js";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <Dashboard initialData={readProps<DashboardData>({ userName: "", machines: [], sessions: [] })} />
  </StrictMode>,
);
