import WebSocket from "ws";
import { closeReason, daemonPath, deviceCloseCodes, parseRelayMessage, relayWebSocketUrl, type DaemonMessage } from "../index.js";
import type { DeviceHost } from "./host.js";

const defaultHeartbeatMs = 30_000;

/**
 * How a device socket ended. `failed`: it never opened. `disconnected`: it closed after opening.
 * `replaced`, `revoked`, `unsupported_version`: the relay closed it with that code.
 * `unauthorized`, `forbidden`: the upgrade was refused with 401 or 403.
 */
export type DeviceSocketEnd = "failed" | "disconnected" | "replaced" | "revoked" | "unsupported_version" | "unauthorized" | "forbidden";

/**
 * Opens one device socket and runs a host on it until the socket closes, then stops the host's agents.
 * Reconnecting is the caller's: each call is one socket and one host.
 */
export function connectDevice(input: {
  relayUrl: string;
  accessToken: string;
  /** Makes the host for this socket. It sends through `send`. */
  host: (send: (message: DaemonMessage) => void) => Pick<DeviceHost, "hello" | "receive" | "close">;
  inform: (line: string) => void;
  onConnected?: () => void;
  /** How often the device pings the relay. A ping still unanswered at the next one ends the socket. */
  heartbeatMs?: number;
  signal?: AbortSignal;
}): Promise<DeviceSocketEnd> {
  const socket = new WebSocket(relayWebSocketUrl(input.relayUrl, daemonPath), {
    headers: { authorization: `Bearer ${input.accessToken}` },
    handshakeTimeout: 10_000,
  });
  let unauthorized = false;
  let forbidden = false;
  let connected = false;
  let answered = true;
  // A relay that vanished without closing the socket leaves it open here. Unanswered pings notice.
  const heartbeat = setInterval(() => {
    if (!connected) return;
    if (!answered) {
      input.inform("The relay stopped answering.");
      socket.terminate();
      return;
    }
    answered = false;
    socket.ping();
  }, input.heartbeatMs ?? defaultHeartbeatMs);
  const host = input.host((message) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  });
  const stop = () => {
    host.close();
    socket.terminate();
  };
  return new Promise((resolve) => {
    socket.on("open", () => {
      connected = true;
      input.inform("Connected to relay.");
      input.onConnected?.();
      host.hello();
    });
    socket.on("pong", () => (answered = true));
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const read = parseRelayMessage(parsed);
      if (read.ok) host.receive(read.message);
    });
    socket.on("unexpected-response", (_request, response) => {
      if (response.statusCode === 401) unauthorized = true;
      if (response.statusCode === 403) forbidden = true;
      input.inform(`Relay handshake failed (HTTP ${response.statusCode}).`);
      response.resume();
      socket.terminate();
    });
    socket.on("error", () => {
      if (!unauthorized && !forbidden && !input.signal?.aborted) input.inform("Relay connection failed.");
    });
    socket.on("close", (code) => {
      clearInterval(heartbeat);
      host.close();
      input.signal?.removeEventListener("abort", stop);
      if (!input.signal?.aborted && !unauthorized && !forbidden) input.inform(`Relay disconnected (code ${code}).`);
      const reason = closeReason(deviceCloseCodes, code);
      if (unauthorized) resolve("unauthorized");
      else if (forbidden) resolve("forbidden");
      else if (reason === "replaced" || reason === "revoked" || reason === "unsupported_version") resolve(reason);
      else resolve(connected ? "disconnected" : "failed");
    });
    input.signal?.addEventListener("abort", stop, { once: true });
    if (input.signal?.aborted) stop();
  });
}
