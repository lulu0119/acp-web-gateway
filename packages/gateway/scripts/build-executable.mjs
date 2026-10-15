// Builds `exterior` as one executable for this machine's platform with Node's single
// executable support (ADR 0017), from the bundle `pnpm build` writes. The Node running
// this script is the Node embedded, so a release pins it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 25 || (major === 25 && minor < 7)) {
  console.error(`Node ${process.versions.node} cannot build an executable from an ES module. Use Node 26.`);
  process.exit(1);
}
if (process.platform === "darwin" && process.arch === "x64") {
  console.error("Node does not support single executables on Intel Macs.");
  process.exit(1);
}

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const output = process.argv[2] ?? join(packageDirectory, "dist", process.platform === "win32" ? "exterior.exe" : "exterior");
const scratch = mkdtempSync(join(tmpdir(), "exterior-sea-"));
try {
  const config = join(scratch, "sea-config.json");
  writeFileSync(config, JSON.stringify({
    main: join(packageDirectory, "dist", "bin", "exterior.mjs"),
    mainFormat: "module",
    output,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    // NODE_OPTIONS belongs to the person's own Node, not to this program.
    execArgvExtension: "none",
  }));
  execFileSync(process.execPath, ["--build-sea", config], { stdio: "inherit" });
  // Apple silicon runs only signed code; an ad-hoc signature is enough.
  if (process.platform === "darwin") execFileSync("codesign", ["--sign", "-", "--force", output], { stdio: "inherit" });
  console.log(`Built ${output}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
