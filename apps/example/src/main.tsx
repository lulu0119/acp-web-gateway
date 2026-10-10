import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "./index.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<App />);
