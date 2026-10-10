import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.PAGES_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 47101, strictPort: true },
});
