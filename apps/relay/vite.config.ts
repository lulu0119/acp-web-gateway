import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("./src/web", import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist/public",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL("./src/web/index.html", import.meta.url)),
        account: fileURLToPath(new URL("./src/web/account-main.tsx", import.meta.url)),
        styles: fileURLToPath(new URL("./src/web/styles.css", import.meta.url)),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 47102,
    strictPort: true,
    cors: { origin: new URL(process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:8787").origin },
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/sign-in": "http://127.0.0.1:8787",
      "/consent": "http://127.0.0.1:8787",
      "/device": "http://127.0.0.1:8787",
    },
  },
});
