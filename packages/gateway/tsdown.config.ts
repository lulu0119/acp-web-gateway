import { defineConfig } from "tsdown";

// The CLI ships as one self-contained file: every runtime dependency is a devDependency, so tsdown bundles it.
export default defineConfig({
  entry: { "bin/mukae": "src/bin/mukae.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  dts: false,
  // ws loads these native speedups only when they are installed.
  deps: {
    onlyBundle: ["@mukae/client", "@mukae/contract", "cac", "oauth4webapi", "valibot", "ws"],
    neverBundle: ["bufferutil", "utf-8-validate"],
  },
});
