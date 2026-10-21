import { attachCloseCodes, deviceCloseCodes, deviceScope, deviceSocketPath, frameBytes, parseDeviceMessage } from "@exterioragentprotocol/sdk";
import { heartbeat, type AgentLink, type AttachLink, type FrameSocket, type Registry } from "@exterioragentprotocol/sdk/relay";
import type { createNodeWebSocket } from "@hono/node-ws";
import { createInMemoryDpopReplayStore, verifyDpopProof } from "better-auth/oauth2";
import type { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { WSContext } from "hono/ws";
import type { WebSocket } from "ws";
import { accessAccount, type RelayEnv, type ReadAccess } from "../http.js";
import type { ExteriorAuth } from "../identity/auth.js";
import { attachPath } from "./connections.js";

const defaultHeartbeatMs = 30_000;

/** Whether the account still has a sign-in for the device. */
export type DeviceSignedIn = (input: { userId: string; deviceId: string }) => Promise<boolean>;

export function mountSockets(app: Hono<RelayEnv>, input: {
  exterior: ExteriorAuth;
  deviceSignedIn: DeviceSignedIn;
  registry: Registry;
  readAccess: ReadAccess;
  resourceMetadataUrl: string;
  upgradeWebSocket: ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];
  /** How often the relay pings each socket. One still unanswered at the next ping is ended. */
  heartbeatMs?: number;
}): void {
  const heartbeatMs = input.heartbeatMs ?? defaultHeartbeatMs;
  // A socket whose far end vanished without closing is ended, which ends what it carried.
  const ping = (ws: WSContext<WebSocket>) => {
    if (ws.raw) heartbeat(ws.raw, heartbeatMs);
  };

  // A device's token is bound to its key, whose thumbprint is the device id. Removal and `logout` end the
  // sign-in before the access token expires, so the socket opens only while a sign-in lives.
  app.get(
    deviceSocketPath,
    accessAccount(input, deviceScope),
    createMiddleware<RelayEnv>(async (c, next) => {
      const deviceId = c.get("deviceId");
      if (!deviceId) return c.json({ code: "unauthorized", message: "A device's token must be bound to its key (DPoP)." }, 401);
      c.set("signedIn", await input.deviceSignedIn({ userId: c.get("userId"), deviceId }));
      await next();
    }),
    input.upgradeWebSocket((c) => {
      let device: ReturnType<Registry["connectDevice"]> | undefined;
      const deviceId = c.get("deviceId") ?? "";
      return {
        onOpen(_event, ws) {
          ping(ws);
          if (!c.get("signedIn")) {
            ws.close(deviceCloseCodes.revoked, "revoked");
            return;
          }
          device = input.registry.connectDevice({
            userId: c.get("userId"),
            deviceId,
            send(message) {
              ws.send(JSON.stringify(message));
            },
            close(reason) {
              ws.close(deviceCloseCodes[reason], reason);
            },
          });
        },
        onMessage(event, ws) {
          const read = typeof event.data === "string" ? parseDeviceMessage(parseJson(event.data)) : undefined;
          if (read?.ok === false && read.reason === "unknown") return;
          if (!read?.ok || !device) {
            ws.close(deviceCloseCodes.invalid_message, "invalid_message");
            return;
          }
          device.receive(read.message);
        },
        onClose() {
          device?.close();
        },
      };
    }),
  );

  // The device proves its key, and the relay accepts the dial only for a connection opened on that device. The
  // connection id is unguessable and accepted once, so no access token is needed.
  const replayStore = createInMemoryDpopReplayStore();
  app.get(
    `${deviceSocketPath}/connections/:connectionId`,
    createMiddleware<RelayEnv>(async (c, next) => {
      const proofJwt = c.req.header("dpop");
      const url = new URL(c.req.path, input.exterior.publicUrl).href;
      const proof = proofJwt ? await verifyDpopProof({ proofJwt, method: "GET", url, replayStore }).catch(() => undefined) : undefined;
      if (!proof) return c.json({ code: "unauthorized", message: "Prove the device key (DPoP)." }, 401);
      c.set("deviceId", proof.jkt);
      await next();
    }),
    input.upgradeWebSocket((c) => {
      const connection = { connectionId: c.req.param("connectionId") ?? "", deviceId: c.get("deviceId") ?? "" };
      let link: AgentLink | undefined;
      return {
        onOpen(_event, ws) {
          ping(ws);
          link = ws.raw && input.registry.acceptAgent(connection, { ...frameSocket(ws.raw), close: () => ws.close(1000, "ended") });
          if (!link) ws.close(1008, "unknown_connection");
        },
        onMessage(event, ws) {
          const frame = readFrame(event.data, ws);
          if (frame !== undefined) link?.frame(frame);
        },
        onClose(event) {
          // The device closes normally when the agent ends; anything else is the device going away.
          link?.closed(event.code === 1000);
        },
      };
    }),
  );

  app.get(
    attachPath,
    input.upgradeWebSocket((c) => {
      const ticket = c.req.query("ticket") ?? "";
      let link: AttachLink | undefined;
      return {
        onOpen(_event, ws) {
          ping(ws);
          link = ws.raw && input.registry.acceptClient(ticket, { ...frameSocket(ws.raw), close: (reason) => ws.close(attachCloseCodes[reason], reason) });
          if (!link) ws.close(attachCloseCodes.ticket_rejected, "ticket_rejected");
        },
        onMessage(event, ws) {
          const frame = readFrame(event.data, ws);
          if (frame !== undefined) link?.frame(frame);
        },
        onClose() {
          link?.closed();
        },
      };
    }),
  );
}

function frameSocket(socket: WebSocket): FrameSocket {
  return {
    send: (frame, flushed) => socket.send(frame, () => flushed()),
    unsent: () => socket.bufferedAmount,
    pause: () => socket.pause(),
    resume: () => socket.resume(),
  };
}

/** A frame is one text message no larger than `frameBytes`; anything else closes the socket. */
function readFrame(data: unknown, ws: WSContext<WebSocket>): string | undefined {
  if (typeof data !== "string") {
    ws.close(1003, "binary");
    return undefined;
  }
  if (Buffer.byteLength(data) > frameBytes) {
    ws.close(1009, "frame");
    return undefined;
  }
  return data;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
