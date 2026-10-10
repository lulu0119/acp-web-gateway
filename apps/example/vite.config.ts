import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The unconfigured state copies a setup prompt that needs the real checkout path.
const repositoryPath = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { __REPOSITORY_PATH__: JSON.stringify(repositoryPath) },
  server: { host: "127.0.0.1", port: 47100, strictPort: true },
  plugins: [react(), tailwindcss()],
});
