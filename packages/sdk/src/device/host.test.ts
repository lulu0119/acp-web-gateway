import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { deviceIdOf, generateDeviceKey } from "../dpop.js";
import type { DeviceMessage } from "../index.js";
import { createDeviceHost, devicePlatform, type LaunchAgent, type StartedAgent } from "./host.js";

const connectionId = "connection-1-aaaaaaaaaaa";
const workingDirectory = join("home", "person", "workspace");
const work = { name: "work", agentType: "opencode" };
const deviceKey = await generateDeviceKey();

// Answers each line with the same line, and exits on "exit".
const echoAgent = `process.stdin.setEncoding("utf8");
let pending = "";
process.stdin.on("data", (chunk) => {
  pending += chunk;
  const lines = pending.split("\\n");
  pending = lines.pop();
  for (const line of lines) {
    if (line === "exit") process.exit(0);
    process.stdout.write(line + "\\n");
  }
});`;

test("attaching says hello with the offered agents, the device directory, and the platform, and changes say it again", () => {
  const sent: DeviceMessage[] = [];
  const host = createDeviceHost({ deviceKey, relayUrl: "http://127.0.0.1:1", hostname: "studio", platform: "windows", workingDirectory, agents: [work], launch: () => assert.fail("launched") });
  host.setAgents([work]);
  host.attach((message) => sent.push(message));
  host.setWorkingDirectory("elsewhere");
  host.detach();
  host.setAgents([]);
  assert.deepEqual(sent, [
    { type: "hello", hostname: "studio", workingDirectory, platform: "windows", agents: [work] },
    { type: "hello", hostname: "studio", workingDirectory: "elsewhere", platform: "windows", agents: [work] },
  ]);
});

test("an agent the device does not offer, or cannot start, fails with the reason", async () => {
  const sent: DeviceMessage[] = [];
  const launched: string[] = [];
  const launch: LaunchAgent = (agentName) => {
    launched.push(agentName);
    if (agentName === "work") return "That agent is not installed.";
    return { child: spawn(join(workingDirectory, "missing-agent")), stop: (stopped) => stopped() };
  };
  const host = createDeviceHost({ deviceKey, relayUrl: "http://127.0.0.1:1", hostname: "studio", platform: "linux", workingDirectory, agents: [work, { name: "gone", agentType: "opencode" }], launch });
  host.attach((message) => sent.push(message));
  sent.length = 0;
  host.receive({ type: "open", connectionId, agentName: "missing" });
  host.receive({ type: "open", connectionId: "connection-2-aaaaaaaaaaa", agentName: "work" });
  host.receive({ type: "open", connectionId: "connection-3-aaaaaaaaaaa", agentName: "gone" });
  await waitFor(() => sent.length === 3);
  assert.deepEqual(sent.slice(0, 2), [
    { type: "open_failed", connectionId, message: "That agent is not configured." },
    { type: "open_failed", connectionId: "connection-2-aaaaaaaaaaa", message: "That agent is not installed." },
  ]);
  assert.equal(sent[2]?.type, "open_failed");
  assert.deepEqual(launched, ["work", "gone"]);
});

test("an open starts the agent and dials its own agent socket, which carries one frame per line", async () => {
  const relay = await fakeRelay();
  try {
    const host = createDeviceHost({ deviceKey, relayUrl: relay.url, hostname: "studio", platform: "linux", workingDirectory, agents: [work], launch: () => echo() });
    host.attach(() => undefined);
    host.receive({ type: "open", connectionId, agentName: "work" });
    const [socket, path, proof] = await relay.dialed();
    assert.equal(path, `/eap/v1/device/connections/${connectionId}`);
    // The dial proves the device key, whose thumbprint is the device id, for this socket's address.
    const [header, claims] = proof.split(".").slice(0, 2).map((part) => JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>);
    assert.equal(claims?.htu, `${relay.url}/eap/v1/device/connections/${connectionId}`);
    const { crv, kty, x, y } = header?.jwk as JsonWebKey;
    assert.equal(Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ crv, kty, x, y })))).toString("base64url"), await deviceIdOf(deviceKey));
    socket.send('{"id":1}');
    const [answer] = (await once(socket, "message")) as [Buffer];
    assert.equal(answer.toString(), '{"id":1}');
    // The agent ending closes the socket normally, which the relay reads as the agent having exited.
    socket.send("exit");
    const [code] = (await once(socket, "close")) as [number];
    assert.equal(code, 1000);
  } finally {
    relay.close();
  }
});

test("the relay closing an agent socket stops its agent, and stopping the device closes the socket as going away", async () => {
  const relay = await fakeRelay();
  try {
    const stopped: string[] = [];
    const host = createDeviceHost({
      deviceKey,
      relayUrl: relay.url,
      hostname: "studio",
      platform: "linux",
      workingDirectory,
      agents: [work],
      launch: () => {
        const agent = echo();
        return { child: agent.child, stop: (done) => agent.stop(() => (stopped.push("stopped"), done())) };
      },
    });
    host.attach(() => undefined);
    host.receive({ type: "open", connectionId, agentName: "work" });
    const [first] = await relay.dialed();
    first.close(1000);
    await waitFor(() => stopped.length === 1);

    host.receive({ type: "open", connectionId: "connection-2-aaaaaaaaaaa", agentName: "work" });
    const [second] = await relay.dialed();
    host.stop();
    const [code] = (await once(second, "close")) as [number];
    assert.equal(code, 1001);
    await waitFor(() => stopped.length === 2);
  } finally {
    relay.close();
  }
});

test("a device reports the platforms EAP names", () => {
  assert.equal(devicePlatform("darwin"), "macos");
  assert.equal(devicePlatform("win32"), "windows");
  assert.equal(devicePlatform("linux"), "linux");
  assert.equal(devicePlatform("freebsd"), undefined);
});

function echo(): StartedAgent {
  const child = spawn(process.execPath, ["-e", echoAgent], { stdio: ["pipe", "pipe", "pipe"] });
  return {
    child,
    stop(stopped) {
      if (child.exitCode !== null) {
        stopped();
        return;
      }
      child.once("exit", () => stopped());
      child.kill();
    },
  };
}

async function fakeRelay(): Promise<{ url: string; dialed: () => Promise<[WebSocket, string, string]>; close: () => void }> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const waiting: ((dial: [WebSocket, string, string]) => void)[] = [];
  const arrived: [WebSocket, string, string][] = [];
  server.on("connection", (socket, request) => {
    const dial: [WebSocket, string, string] = [socket, request.url ?? "", String(request.headers.dpop ?? "")];
    const next = waiting.shift();
    if (next) next(dial);
    else arrived.push(dial);
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    dialed: () => {
      const ready = arrived.shift();
      return ready ? Promise.resolve(ready) : new Promise((resolve) => waiting.push(resolve));
    },
    close: () => {
      for (const client of server.clients) client.terminate();
      server.close();
    },
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !condition(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(condition());
}
