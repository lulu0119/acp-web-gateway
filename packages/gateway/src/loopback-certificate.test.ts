import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { ensureLoopbackCertificate } from "./loopback-certificate.js";

const execFileAsync = promisify(execFile);

test("the loopback certificate names 127.0.0.1 and cannot sign other certificates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mukae-tls-"));
  const created = await ensureLoopbackCertificate(directory);
  const again = await ensureLoopbackCertificate(directory);
  assert.equal(created.created, true);
  assert.equal(again.created, false);
  const text = await execFileAsync("openssl", ["x509", "-in", created.certPath, "-noout", "-text"]);
  assert.match(text.stdout, /IP Address:127\.0\.0\.1/);
  assert.match(text.stdout, /CA:FALSE/);
});
