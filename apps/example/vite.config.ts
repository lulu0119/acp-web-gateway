import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: 47100, strictPort: true },
  plugins: [react(), tailwindcss()],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
