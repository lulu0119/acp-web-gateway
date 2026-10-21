import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeviceRegistrationError, registerDevice } from "@exterior/contract";
import { beforeEach, test, vi } from "vitest";
import { readDeviceId } from "./device-ids.js";
import { deviceIdFor, signInDaemon } from "./login.js";
import { removeSignIn } from "./sign-ins.js";

vi.mock("@exterior/contract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@exterior/contract")>()),
  fetchPublicClients: vi.fn(async () => ({ daemonClientId: "daemon-client" })),
  registerDevice: vi.fn(async () => undefined),
}));
vi.mock("@exterioragentprotocol/sdk/device", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@exterioragentprotocol/sdk/device")>()),
  beginDeviceAuthorization: vi.fn(async () => ({ verificationUri: "https://relay.example/device", userCode: "ABCD-EFGH", expiresAt: Date.now() + 600_000 })),
  pollDeviceAuthorization: vi.fn(async () => ({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: Date.now() + 3_600_000 })),
}));

const relayUrl = "https://relay.example";
const register = vi.mocked(registerDevice);

beforeEach(() => register.mockClear());

function signIn(home: string) {
  return signInDaemon({ relayUrl, hostname: "studio", inform: () => undefined, homeDirectory: home });
}

test("signing out and in again keeps the device id", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-login-"));
  await signIn(home);
  const first = register.mock.calls[0]?.[2].deviceId;
  assert.ok(first);
  assert.deepEqual(register.mock.calls[0]?.[2], { deviceId: first, hostname: "studio", refreshToken: "refresh-1" });
  await removeSignIn(relayUrl, home);
  await signIn(home);
  assert.equal(register.mock.calls[1]?.[2].deviceId, first);
  assert.equal(await deviceIdFor(relayUrl, home), first);
});

test("a device id another account holds on the relay is replaced at sign-in", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-login-"));
  register.mockRejectedValueOnce(new DeviceRegistrationError(409, "That device id belongs to another account."));
  await signIn(home);
  const [taken, fresh] = register.mock.calls.map((call) => call[2].deviceId);
  assert.ok(taken && fresh);
  assert.notEqual(fresh, taken);
  assert.equal(await readDeviceId(relayUrl, home), fresh);
});
