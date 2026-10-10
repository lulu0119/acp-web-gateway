import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LoopbackTls = { cert: Buffer; key: Buffer };

export function loopbackTlsDirectory(applicationSupportDirectory: string): string {
  return join(applicationSupportDirectory, "tls");
}

export async function ensureLoopbackCertificate(applicationSupportDirectory: string): Promise<{
  certPath: string;
  keyPath: string;
  created: boolean;
}> {
  const directory = loopbackTlsDirectory(applicationSupportDirectory);
  const certPath = join(directory, "cert.pem");
  const keyPath = join(directory, "key.pem");
  try {
    await access(certPath);
    await access(keyPath);
    return { certPath, keyPath, created: false };
  } catch {
    await mkdir(directory, { recursive: true });
  }
  await execFileAsync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "825",
    "-nodes",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1,DNS:localhost",
    "-addext",
    "basicConstraints=critical,CA:FALSE",
    "-addext",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "-addext",
    "extendedKeyUsage=serverAuth",
  ]);
  await chmod(keyPath, 0o600);
  return { certPath, keyPath, created: true };
}

export async function trustLoopbackCertificate(certPath: string): Promise<void> {
  const keychain = join(homedir(), "Library/Keychains/login.keychain-db");
  await execFileAsync("security", ["add-trusted-cert", "-r", "trustRoot", "-k", keychain, certPath]);
}

export async function readLoopbackTls(applicationSupportDirectory: string): Promise<LoopbackTls> {
  const paths = await ensureLoopbackCertificate(applicationSupportDirectory);
  return { cert: await readFile(paths.certPath), key: await readFile(paths.keyPath) };
}
