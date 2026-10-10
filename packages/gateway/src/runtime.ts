import { readFileSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type RuntimePointer = {
  nodePath: string;
  cliPath: string;
};

export function runtimeDirectory(applicationSupportDirectory: string): string {
  return join(applicationSupportDirectory, "runtime");
}

export function runtimePointerPath(applicationSupportDirectory: string): string {
  return join(applicationSupportDirectory, "runtime.json");
}

export async function writeRuntimePointer(
  applicationSupportDirectory: string,
  pointer: RuntimePointer,
): Promise<void> {
  await mkdir(applicationSupportDirectory, { recursive: true });
  await writeFile(
    runtimePointerPath(applicationSupportDirectory),
    `${JSON.stringify({ nodePath: pointer.nodePath, cliPath: pointer.cliPath }, null, 2)}\n`,
  );
}

export function runtimeDependencies(): { name: string; directory: string }[] {
  return ["ws", "@mukae/contract"].map((name) => ({
    name,
    directory: packageDirectory(fileURLToPath(import.meta.resolve(name)), name),
  }));
}

export async function copyGatewayRuntime(input: {
  sourceDistDirectory: string;
  destinationRoot: string;
  packages: readonly { name: string; directory: string }[];
}): Promise<string> {
  const staging = `${input.destinationRoot}.next`;
  const previous = `${input.destinationRoot}.previous`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, "dist"), { recursive: true });
  const entries = await readdir(input.sourceDistDirectory);
  for (const entry of entries) {
    if (!entry.endsWith(".js") || entry.endsWith(".test.js")) continue;
    await cp(join(input.sourceDistDirectory, entry), join(staging, "dist", entry));
  }
  await writeFile(
    join(staging, "package.json"),
    `${JSON.stringify({ name: "mukae", private: true, type: "module" }, null, 2)}\n`,
  );
  for (const dependency of input.packages) {
    const destination = join(staging, "node_modules", ...dependency.name.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await copyPackage(dependency.directory, destination);
  }
  await rm(previous, { recursive: true, force: true });
  try {
    await rename(input.destinationRoot, previous);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  await rename(staging, input.destinationRoot);
  await rm(previous, { recursive: true, force: true });
  return join(input.destinationRoot, "dist", "cli.js");
}

function packageDirectory(entryFile: string, name: string): string {
  let directory = dirname(entryFile);
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { name?: unknown };
      if (manifest.name === name) return directory;
    } catch {
      // This directory is not the package root.
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot find the ${name} package next to mukae.`);
    directory = parent;
  }
}

async function copyPackage(directory: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(directory);
  for (const entry of entries) {
    if (entry === "node_modules") continue;
    await cp(join(directory, entry), join(destination, entry), { recursive: true, dereference: true });
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
