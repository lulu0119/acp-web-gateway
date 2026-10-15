// Builds the `exterior` executable and puts it where Tauri bundles a sidecar: named with
// the Rust target triple, which Tauri strips when it copies the file beside the app.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const gateway = fileURLToPath(new URL("../../../packages/gateway/", import.meta.url));
const binaries = fileURLToPath(new URL("../src-tauri/binaries/", import.meta.url));
const windows = process.platform === "win32";

execFileSync("pnpm", ["run", "build:executable"], { cwd: gateway, stdio: "inherit", shell: windows });
const triple = execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
mkdirSync(binaries, { recursive: true });
const extension = windows ? ".exe" : "";
copyFileSync(`${gateway}dist/exterior${extension}`, `${binaries}exterior-${triple}${extension}`);
console.log(`Sidecar: src-tauri/binaries/exterior-${triple}${extension}`);
