import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exteriorDeviceClient } from "@exterior/contract";
import { beginDeviceAuthorization, deviceIdOf, pollDeviceAuthorization } from "@exterioragentprotocol/sdk/device";
import { beforeEach, test, vi } from "vitest";
import { readDeviceKey } from "./device-keys.js";
import { signInDaemon } from "./login.js";
import { readSignIn, removeSignIn } from "./sign-ins.js";

vi.mock("@exterioragentprotocol/sdk/device", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@exterioragentprotocol/sdk/device")>()),
  beginDeviceAuthorization: vi.fn(async ({ clientId }: { clientId: string }) => ({ clientId, verificationUri: "https://relay.example/device", userCode: "ABCD-EFGH", expiresAt: Date.now() + 600_000 })),
  pollDeviceAuthorization: vi.fn(async () => ({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: Date.now() + 3_600_000 })),
}));

const relayUrl = "https://relay.example";
const poll = vi.mocked(pollDeviceAuthorization);

beforeEach(() => poll.mockClear());

function signIn(home: string) {
  return signInDaemon({ relayUrl, inform: () => undefined, homeDirectory: home });
}

async function polledWith(call: number): Promise<string> {
  const args = poll.mock.calls[call];
  assert.ok(args);
  return await deviceIdOf(args[1]);
}

test("a device signs in as Exterior's device software, with a key it keeps through signing out", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-login-"));
  await signIn(home);
  assert.equal(vi.mocked(beginDeviceAuthorization).mock.calls[0]?.[0].clientId, exteriorDeviceClient.client_id);
  assert.equal((await readSignIn(relayUrl, home))?.clientId, exteriorDeviceClient.client_id);
  const kept = await readDeviceKey(relayUrl, home);
  assert.ok(kept);
  assert.equal(await polledWith(0), await deviceIdOf(kept));
  await removeSignIn(relayUrl, home);
  await signIn(home);
  assert.equal(await polledWith(1), await polledWith(0));
});

test("each relay gets its own key, so the relays cannot tell they reach one computer", async () => {
  const home = await mkdtemp(join(tmpdir(), "exterior-login-"));
  await signIn(home);
  await signInDaemon({ relayUrl: "https://other.example", inform: () => undefined, homeDirectory: home });
  assert.notEqual(await polledWith(1), await polledWith(0));
});
