#!/usr/bin/env node
import { homedir } from "node:os";
import { executeCli } from "../cli/cli.js";

// The first interrupt asks the running command to stop; a second one exits at once.
const controller = new AbortController();
const interrupt = () => {
  if (controller.signal.aborted) process.exit(130);
  controller.abort();
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

try {
  process.exitCode = await executeCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    homeDirectory: homedir(),
  }, { signal: controller.signal });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
