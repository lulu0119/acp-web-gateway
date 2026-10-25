import { clientScope, mcpEndpointsPath, mcpFrameBytes, mcpSocketCloseCodes } from "@exterioragentprotocol/sdk";
import { heartbeat } from "@exterioragentprotocol/sdk/relay";
import type { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";
import type { McpEndpoints, McpSocketLink } from "../mcp/endpoints.js";
import type { IsGranted } from "./connections.js";
import { defaultHeartbeatMs } from "./sockets.js";

/** Where a page dials the ticket of the endpoint it serves. */
const mcpSocketPath = `${mcpEndpointsPath}/socket`;
/** Where an agent reaches every endpoint; its bearer token names which. */
const mcpPath = "/eap/v1/mcp";

export function mountMcp(app: Hono<RelayEnv>, input: {
  endpoints: McpEndpoints;
  readAccess: ReadAccess;
  resourceMetadataUrl: string;
  isGranted: IsGranted;
  publicUrl: string;
  upgradeWebSocket: ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];
  heartbeatMs?: number;
}): void {
  const heartbeatMs = input.heartbeatMs ?? defaultHeartbeatMs;
  app.post(mcpEndpointsPath, accessAccount(input, clientScope), async (c) => {
    if (!(await input.isGranted(c.get("userId"), c.get("clientId")))) return c.json({ code: "target_not_found", message: "This app is no longer allowed to serve tools." }, 404);
    const { ticket, token } = input.endpoints.open({ userId: c.get("userId"), clientId: c.get("clientId") });
    const socket = new URL(mcpSocketPath, input.publicUrl);
    socket.protocol = socket.protocol === "https:" ? "wss:" : "ws:";
    socket.searchParams.set("ticket", ticket);
    return c.json({ url: socket.href, mcpUrl: new URL(mcpPath, input.publicUrl).href, token }, 201);
  });

  app.get(
    mcpSocketPath,
    input.upgradeWebSocket((c) => {
      const ticket = c.req.query("ticket") ?? "";
      let link: McpSocketLink | undefined;
      return {
        onOpen(_event, ws) {
          if (ws.raw) heartbeat(ws.raw, heartbeatMs);
          link = input.endpoints.acceptSocket(ticket, {
            send: (frame) => ws.send(frame),
            close: (reason) => ws.close(reason === "invalid_message" ? 1008 : mcpSocketCloseCodes[reason], reason),
          });
          if (!link) ws.close(mcpSocketCloseCodes.ticket_rejected, "ticket_rejected");
        },
        onMessage(event, ws) {
          if (typeof event.data !== "string") ws.close(1003, "binary");
          else if (Buffer.byteLength(event.data) > mcpFrameBytes) ws.close(1009, "frame");
          else link?.frame(event.data);
        },
        onClose() {
          link?.closed();
        },
      };
    }),
  );

  // The token is the endpoint's own secret, not an access token: an unknown one is answered 404, so an MCP client
  // does not go looking for an authorization server.
  app.all(mcpPath, (c) => {
    const token = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
    return input.endpoints.handle(token, c.req.raw);
  });
}
