import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @exterior/ui resolves React from its own folder; one copy keeps hooks working.
  resolve: { dedupe: ["react", "react-dom"] },
  clearScreen: false,
  server: { host: "127.0.0.1", port: 47103, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
