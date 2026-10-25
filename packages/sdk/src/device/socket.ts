import WebSocket from "ws";
import { dpopProof, type DeviceKey } from "../dpop.js";
import { heartbeat } from "../heartbeat.js";
import { closeReason, deviceCloseCodes, deviceSocketPath, parseJson, parseRelayMessage, relayWebSocketUrl, type DeviceCloseReason } from "../index.js";
import type { DeviceHost } from "./host.js";

export const defaultHeartbeatMs = 30_000;

/** Dials a relay socket, giving up on an upgrade that has not answered in ten seconds. */
export function dialRelay(url: string, headers: Record<string, string>): WebSocket {
  return new WebSocket(url, { headers, handshakeTimeout: 10_000 });
}

type Refusal = "unauthorized" | "forbidden" | "unsupported_version";
const refusals = new Map<number, Refusal>([[401, "unauthorized"], [403, "forbidden"], [404, "unsupported_version"]]);

/**
 * How a device socket ended. `failed`: it never opened. `disconnected`: it closed after opening.
 * `replaced`, `revoked`: the relay closed it with that code. `unauthorized`, `forbidden`: the upgrade was
 * refused with 401 or 403. `unsupported_version`: the relay has no device socket at this version's path (404).
 */
export type DeviceSocketEnd = "failed" | "disconnected" | DeviceCloseReason | Refusal;

/**
 * Opens one device socket and attaches the host to it until it closes. The host's agents keep running across
 * reconnects, which are the caller's: each call is one socket.
 */
export async function connectDevice(input: {
  relayUrl: string;
  accessToken: string;
  /** The key the access token is bound to. Each upgrade carries a proof of it. */
  deviceKey: DeviceKey;
  host: Pick<DeviceHost, "attach" | "detach" | "receive">;
  inform: (line: string) => void;
  onConnected?: () => void;
  /** How often the device pings the relay. A ping still unanswered at the next one ends the socket. */
  heartbeatMs?: number;
  signal?: AbortSignal;
}): Promise<DeviceSocketEnd> {
  const url = relayWebSocketUrl(input.relayUrl, deviceSocketPath);
  const socket = dialRelay(url, { authorization: `DPoP ${input.accessToken}`, dpop: await dpopProof(input.deviceKey, "GET", url, input.accessToken) });
  let refused: Refusal | undefined;
  let connected = false;
  const stop = () => socket.terminate();
  return new Promise((resolve) => {
    socket.on("open", () => {
      connected = true;
      // A relay that vanished without closing the socket leaves it open here. Unanswered pings notice.
      heartbeat(socket, input.heartbeatMs ?? defaultHeartbeatMs, () => input.inform("The relay stopped answering."));
      input.inform("Connected to relay.");
      input.onConnected?.();
      input.host.attach((message) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      });
    });
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      const read = parseRelayMessage(parseJson(data.toString()));
      if (read.ok) input.host.receive(read.message);
    });
    socket.on("unexpected-response", (_request, response) => {
      refused = refusals.get(response.statusCode ?? 0);
      input.inform(`Relay handshake failed (HTTP ${response.statusCode}).`);
      response.resume();
      socket.terminate();
    });
    socket.on("error", () => {
      if (!refused && !input.signal?.aborted) input.inform("Relay connection failed.");
    });
    socket.on("close", (code) => {
      if (connected) input.host.detach();
      input.signal?.removeEventListener("abort", stop);
      if (!input.signal?.aborted && !refused) input.inform(`Relay disconnected (code ${code}).`);
      const reason = closeReason(deviceCloseCodes, code);
      if (refused) resolve(refused);
      else if (reason) resolve(reason);
      else resolve(connected ? "disconnected" : "failed");
    });
    input.signal?.addEventListener("abort", stop, { once: true });
    if (input.signal?.aborted) stop();
  });
}
