import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyGatewayRuntime, runtimeDependencies } from "./runtime.js";

test("the runtime copy keeps the program and its packages, and drops tests", async () => {
  const root = await mkdtemp(join(tmpdir(), "mukae-runtime-"));
  const source = join(root, "dist");
  const dependency = join(root, "ws");
  const destination = join(root, "runtime");
  await mkdir(source);
  await mkdir(dependency);
  await writeFile(join(source, "cli.js"), "console.log('one');\n");
  await writeFile(join(source, "cli.test.js"), "test\n");
  await writeFile(join(source, "notes.txt"), "skip\n");
  await writeFile(join(dependency, "package.json"), '{"name":"ws"}\n');
  await writeFile(join(dependency, "index.js"), "module.exports = {};\n");

  const cliPath = await copyGatewayRuntime({
    sourceDistDirectory: source,
    destinationRoot: destination,
    packages: [{ name: "ws", directory: dependency }],
  });
  assert.equal(cliPath, join(destination, "dist", "cli.js"));
  assert.equal(await readFile(cliPath, "utf8"), "console.log('one');\n");
  await assert.rejects(() => readFile(join(destination, "dist", "cli.test.js"), "utf8"));
  await assert.rejects(() => readFile(join(destination, "dist", "notes.txt"), "utf8"));
  assert.match(await readFile(join(destination, "node_modules", "ws", "package.json"), "utf8"), /"name":"ws"/);
  assert.match(await readFile(join(destination, "package.json"), "utf8"), /"type": "module"/);

  await writeFile(join(source, "cli.js"), "console.log('two');\n");
  await copyGatewayRuntime({
    sourceDistDirectory: source,
    destinationRoot: destination,
    packages: [{ name: "ws", directory: dependency }],
  });
  assert.equal(await readFile(cliPath, "utf8"), "console.log('two');\n");
});

test("runtime dependencies resolve the packages the built CLI imports", () => {
  const dependencies = runtimeDependencies();
  assert.deepEqual(
    dependencies.map((dependency) => dependency.name),
    ["ws", "@mukae/contract"],
  );
  for (const dependency of dependencies) {
    assert.equal(dependency.directory.endsWith(dependency.name.split("/").at(-1) ?? ""), true);
  }
});
