import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL("./dashboard.html", import.meta.url)),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 47102,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/sign-in": "http://127.0.0.1:8787",
      "/consent": "http://127.0.0.1:8787",
      "/device": "http://127.0.0.1:8787",
    },
  },
});
