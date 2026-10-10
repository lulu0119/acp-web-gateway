import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The page shows the copied setup prompt with the real checkout path, so the agent gets an exact `cd`.
const repositoryPath = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __REPOSITORY_PATH__: JSON.stringify(repositoryPath) },
  server: { host: "127.0.0.1", port: 47101, strictPort: true },
});
