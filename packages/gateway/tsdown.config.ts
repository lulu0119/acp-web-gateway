import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// The CLI ships as one self-contained file: every runtime dependency is a devDependency, so tsdown bundles it.
export default defineConfig({
  entry: { "bin/exterior": "src/bin/exterior.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  dts: false,
  define: { __EXTERIOR_VERSION__: JSON.stringify(version) },
  // ws loads these native speedups only when they are installed.
  deps: {
    onlyBundle: ["@exterior/contract", "@exterioragentprotocol/sdk", "cac", "oauth4webapi", "valibot", "ws"],
    neverBundle: ["bufferutil", "utf-8-validate"],
  },
});
