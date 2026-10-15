import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The window reuses the relay's UI (ADR 0012), so the two look like one product.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@relay": fileURLToPath(new URL("../relay/src/web", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  clearScreen: false,
  server: { host: "127.0.0.1", port: 47103, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
