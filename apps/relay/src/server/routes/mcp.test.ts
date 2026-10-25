import assert from "node:assert/strict";
import { once } from "node:events";
import { serve } from "@hono/node-server";
import { mcpSocketCloseCodes } from "@exterioragentprotocol/sdk";
import { serveMcp, type ServedMcp } from "@exterioragentprotocol/sdk/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { test } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";
import type { ReadAccess } from "../http.js";
import { openTestRelay, sessionCookie } from "../testing.js";

const clientId = "https://playground.example/oauth-client.json";

test("an agent calls a tool the page serves, and each MCP session is its own server on the page", async () => {
  const relay = await listen();
  let servers = 0;
  const served = await serveMcp(relay.url, relay.userId, (transport) => {
    servers += 1;
    const server = new McpServer({ name: "playground", version: "1.0.0" });
    const id = servers;
    server.registerTool("echo", { inputSchema: { text: z.string() } }, ({ text }) => ({ content: [{ type: "text", text: `${id}:${text}` }] }));
    void server.connect(transport);
  });
  try {
    const first = await agent(served);
    const second = await agent(served);
    assert.deepEqual((await first.listTools()).tools.map((tool) => tool.name), ["echo"]);
    assert.deepEqual((await first.callTool({ name: "echo", arguments: { text: "hi" } })).content, [{ type: "text", text: "1:hi" }]);
    assert.deepEqual((await second.callTool({ name: "echo", arguments: { text: "hi" } })).content, [{ type: "text", text: "2:hi" }]);
    await first.close();
    await second.close();
  } finally {
    served.close();
    relay.close();
  }
});

test("an agent that cancels a call aborts the page's handler", async () => {
  const relay = await listen();
  let aborted: () => void = () => undefined;
  const wasAborted = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  let started: () => void = () => undefined;
  const hasStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const served = await serveMcp(relay.url, relay.userId, (transport) => {
    const server = new McpServer({ name: "playground", version: "1.0.0" });
    server.registerTool("wait", {}, (extra) => new Promise((resolve) => {
      started();
      extra.signal.addEventListener("abort", () => {
        aborted();
        resolve({ content: [] });
      });
    }));
    void server.connect(transport);
  });
  try {
    const client = await agent(served);
    const cancel = new AbortController();
    const call = client.callTool({ name: "wait" }, undefined, { signal: cancel.signal });
    await hasStarted;
    cancel.abort();
    await assert.rejects(call);
    await wasAborted;
    await client.close();
  } finally {
    served.close();
    relay.close();
  }
});

test("the endpoint ends with the page's socket: a pending call fails and the address is gone", async () => {
  const relay = await listen();
  let started: () => void = () => undefined;
  const hasStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const served = await serveMcp(relay.url, relay.userId, (transport) => {
    const server = new McpServer({ name: "playground", version: "1.0.0" });
    server.registerTool("wait", {}, () => new Promise(() => started()));
    void server.connect(transport);
  });
  try {
    const client = await agent(served);
    const call = client.callTool({ name: "wait" });
    await hasStarted;
    served.close();
    assert.equal(await served.closed, undefined);
    await assert.rejects(call);
    await assert.rejects(agent(served));
    const stray = await fetch(served.url, { method: "POST", headers: { authorization: "Bearer unknown", "content-type": "application/json" }, body: "{}" });
    assert.equal(stray.status, 404);
  } finally {
    relay.close();
  }
});

test("revoking the app closes the page's socket with revoked", async () => {
  const relay = await listen();
  const served = await serveMcp(relay.url, relay.userId, () => undefined);
  try {
    const revoked = await fetch(`${relay.url}/api/grants/revoke`, {
      method: "POST",
      headers: { cookie: relay.cookie, "content-type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    assert.equal(revoked.status, 200);
    assert.equal(await served.closed, "revoked");
    await assert.rejects(agent(served));
  } finally {
    relay.close();
  }
});

test("a page's ticket opens one socket", async () => {
  const relay = await listen();
  const opened = await fetch(`${relay.url}/eap/v1/mcp-endpoints`, { method: "POST", headers: { authorization: `Bearer ${relay.userId}` } });
  assert.equal(opened.status, 201);
  const { url } = (await opened.json()) as { url: string };
  const page = new WebSocket(url);
  try {
    await once(page, "open");
    const second = new WebSocket(url);
    const [code] = (await once(second, "close")) as [number];
    assert.equal(code, mcpSocketCloseCodes.ticket_rejected);
  } finally {
    page.close();
    relay.close();
  }
});

async function agent(served: ServedMcp): Promise<Client> {
  const client = new Client({ name: "agent", version: "1.0.0" });
  const headers = Object.fromEntries(served.headers.map(({ name, value }) => [name, value]));
  await client.connect(new StreamableHTTPClientTransport(new URL(served.url), { requestInit: { headers } }));
  return client;
}

/**
 * A relay listening on a real port, with that port as its public address, so the page dials and the agent calls
 * the addresses the relay hands out. A page's bearer token is the account's user id.
 */
async function listen() {
  let fetchRelay: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 503 });
  const { server, port } = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    const listening = serve({ fetch: (request) => fetchRelay(request), port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({ server: listening, port: info.port });
    });
  });
  const url = `http://127.0.0.1:${port}`;
  const readAccess: ReadAccess = async (request) => {
    const userId = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
    return userId ? { userId, clientId, scopes: ["eap:client"] } : undefined;
  };
  const relay = await openTestRelay({ publicUrl: url, readAccess });
  fetchRelay = relay.app.fetch;
  relay.injectWebSocket(server);
  const context = await relay.exterior.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Ada", email: "ada@example.test", emailVerified: true }, { method: "test" });
  const session = await context.internalAdapter.createSession(user.id);
  return {
    url,
    userId: user.id,
    cookie: await sessionCookie(session.token),
    close: () => server.close(),
  };
}
