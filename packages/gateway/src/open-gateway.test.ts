import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { buildLaunchUrl, defaultGatewayPort } from "@mukae/contract";
import { writeGatewayConfig } from "./config.js";
import { startGatewaySession } from "./open-gateway.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = "https://app.example";
const nonce = "nonce-1234";

test("one configuration for the requested type starts without asking for a name", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-session-"));
  await writeGatewayConfig(
    {
      agents: [
        { name: "work", agentType: "opencode", env: {} },
        { name: "notes", agentType: "claude", env: {} },
      ],
    },
    homeDirectory,
  );
  let asked = false;
  const session = await startGatewaySession(launchUrl("opencode"), {
    homeDirectory,
    port: 0,
    idleTimeoutMs: 15_000,
    chooseName: async () => {
      asked = true;
      return undefined;
    },
  });
  try {
    assert.equal(asked, false);
    assert.equal((await requestStatus(session.port)).body, JSON.stringify({ status: "waiting" }));
  } finally {
    session.stop();
    await session.finished;
  }
});

test("several configurations of one type wait for a local name and then become ready", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-session-"));
  await writeGatewayConfig(
    {
      agents: [
        { name: "work", agentType: "opencode", env: { MARKER: "work" } },
        { name: "personal", agentType: "opencode", env: { MARKER: "personal" } },
      ],
    },
    homeDirectory,
  );
  let offered: readonly string[] = [];
  let resolveName: (name: string | undefined) => void = () => {};
  const choice = new Promise<string | undefined>((resolve) => {
    resolveName = resolve;
  });
  const session = await startGatewaySession(launchUrl("opencode"), {
    homeDirectory,
    port: 0,
    idleTimeoutMs: 15_000,
    chooseName: (agentType, names) => {
      assert.equal(agentType, "opencode");
      offered = names;
      return choice;
    },
  });
  try {
    assert.deepEqual(offered, ["work", "personal"]);
    assert.equal((await requestStatus(session.port)).body, JSON.stringify({ status: "choosing" }));
    resolveName("personal");
    await waitForBody(session.port, JSON.stringify({ status: "waiting" }));
  } finally {
    session.stop();
    await session.finished;
  }
});

test("a type with no configuration is unconfigured and the status omits other names", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "mukae-session-"));
  await writeGatewayConfig(
    { agents: [{ name: "work", agentType: "opencode", env: {} }] },
    homeDirectory,
  );
  const session = await startGatewaySession(launchUrl("claude"), {
    homeDirectory,
    port: 0,
    idleTimeoutMs: 15_000,
  });
  try {
    const body = (await requestStatus(session.port)).body;
    assert.equal(body, JSON.stringify({ status: "unconfigured" }));
    assert.equal(body.includes("work"), false);
  } finally {
    session.stop();
    await session.finished;
  }
});

function launchUrl(agentType: string): string {
  return buildLaunchUrl({ nonce, origin, agentType, port: defaultGatewayPort });
}

function requestStatus(port: number): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/status",
        method: "GET",
        headers: { Origin: origin },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

async function waitForBody(port: number, body: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await requestStatus(port)).body === body) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`status did not become ${body}`);
}
