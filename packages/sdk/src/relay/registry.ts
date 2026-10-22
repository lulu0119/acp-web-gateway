import { randomBytes, randomUUID } from "node:crypto";
import { frameBytes, type AgentSlot, type AttachCloseReason, type Device, type DeviceCloseReason, type DeviceMessage, type DevicePlatform, type RelayMessage } from "../index.js";

/** Why the relay closes a device socket: an EAP close code's name, or `invalid_message`, which closes it with 1008. */
export type DeviceSocketClose = DeviceCloseReason | "invalid_message";

const defaultTicketTtlMs = 60_000;
const defaultOpenTimeoutMs = 15_000;
/** Unsent bytes on one socket past which the relay stops reading the socket that feeds it. */
const maxUnsentBytes = frameBytes;

/** A live connection, as an account's own pages list it. */
export type ConnectionInfo = {
  deviceId: string;
  agentName: string;
  agentType: string;
  /** The OAuth client that opened the connection. */
  clientId: string;
};

export type OpenConnectionResult =
  | { ok: true; ticket: string }
  | { ok: false; status: 404 | 502 | 504; code: "target_not_found" | "agent_start_failed" | "device_timeout"; message: string };

/** One end of a connection's data path: the client's attach socket or the device's agent socket. */
export type FrameSocket = {
  /** Sends a frame. `flushed` is called once the frame has left the relay. */
  send(frame: string, flushed: () => void): void;
  /** Bytes sent but not yet flushed. */
  unsent(): number;
  /** Stops reading frames from this socket, and `resume` starts again. */
  pause(): void;
  resume(): void;
};

export type AttachSocket = FrameSocket & { close(reason: AttachCloseReason): void };
export type AgentSocket = FrameSocket & { close(): void };

/** What a socket's handler tells the registry. */
export type AttachLink = { frame(frame: string): void; closed(): void };
/** `agentExited`: the device closed the agent socket because the agent ended, rather than the socket dropping. */
export type AgentLink = { frame(frame: string): void; closed(agentExited: boolean): void };

type OnlineDevice = {
  /** The relay's own id for this device socket. It changes on every reconnect; the device id does not. */
  socketId: string;
  userId: string;
  deviceId: string;
  hostname: string;
  platform: DevicePlatform;
  workingDirectory: string;
  agents: readonly AgentSlot[];
  send: (message: RelayMessage) => void;
  close: (reason: DeviceSocketClose) => void;
};

type Connection = {
  id: string;
  userId: string;
  deviceId: string;
  agentName: string;
  agentType: string;
  clientId: string;
  ticket: string;
  expiresAt: number;
  state: "opening" | "issued" | "attached" | "ended";
  agent?: AgentSocket;
  client?: AttachSocket;
  /** Frames the agent socket delivered before it was paused and a client attached. */
  held: string[];
  timer: ReturnType<typeof setTimeout>;
  resolve?: (result: OpenConnectionResult) => void;
};

/** Told when a device socket says hello and when it closes, so the device can be listed while offline. */
export type SeenDevice = (input: { userId: string; deviceId: string; hostname: string; platform: DevicePlatform }) => void;

export type Registry = {
  /**
   * A device socket the relay admitted. `deviceId` is the key its token is bound to. `close` ends the socket when
   * a newer one replaces it, the device is removed, or it breaks the protocol.
   */
  connectDevice(input: { userId: string; deviceId: string; send: (message: RelayMessage) => void; close: (reason: DeviceSocketClose) => void }): {
    receive(message: DeviceMessage): void;
    close(): void;
  };
  listDevices(userId: string): Device[];
  listConnections(userId: string): ConnectionInfo[];
  openConnection(input: { userId: string; clientId: string; deviceId: string; agentName: string }): Promise<OpenConnectionResult>;
  /**
   * A device dialed the agent socket of a connection, proving `deviceId`. Undefined when the relay is not waiting for
   * that connection, or it was opened on another device, and the socket is closed.
   */
  acceptAgent(input: { connectionId: string; deviceId: string }, socket: AgentSocket): AgentLink | undefined;
  /** A client dialed a ticket. Dialing consumes it; undefined when it is used, expired or unknown. */
  acceptClient(ticket: string, socket: AttachSocket): AttachLink | undefined;
  /** The device was removed: its device socket closes with `revoked` and its connections end. */
  removeDevice(input: { userId: string; deviceId: string }): void;
  /** The account revoked the client: its connections end with `revoked`. */
  revokeClient(input: { userId: string; clientId: string }): void;
};

const notStarted: OpenConnectionResult = { ok: false, status: 502, code: "agent_start_failed", message: "The device did not start the agent." };
const deviceTimeout: OpenConnectionResult = { ok: false, status: 504, code: "device_timeout", message: "The device did not answer." };

export function createRegistry(input?: { now?: () => number; ticketTtlMs?: number; openTimeoutMs?: number; seen?: SeenDevice }): Registry {
  const now = input?.now ?? Date.now;
  const seen = input?.seen ?? (() => undefined);
  const ticketTtlMs = input?.ticketTtlMs ?? defaultTicketTtlMs;
  const openTimeoutMs = input?.openTimeoutMs ?? defaultOpenTimeoutMs;
  const devices = new Map<string, OnlineDevice>();
  const connections = new Map<string, Connection>();
  const byTicket = new Map<string, Connection>();

  /**
   * Closes whichever of the connection's sockets are still open, telling the attach socket `close`, and answers an
   * open still waiting with `answer`.
   */
  function end(connection: Connection, close?: AttachCloseReason, answer = notStarted): void {
    if (connection.state === "ended") return;
    connection.state = "ended";
    clearTimeout(connection.timer);
    connections.delete(connection.id);
    byTicket.delete(connection.ticket);
    connection.agent?.close();
    if (close) connection.client?.close(close);
    const resolve = connection.resolve;
    connection.resolve = undefined;
    resolve?.(answer);
  }

  function findDevice(userId: string, deviceId: string): OnlineDevice | undefined {
    for (const device of devices.values()) {
      if (device.userId === userId && device.deviceId === deviceId) return device;
    }
    return undefined;
  }

  function dropDevice(device: OnlineDevice, reason: DeviceCloseReason): void {
    devices.delete(device.socketId);
    try {
      device.close(reason);
    } catch {
      // The socket is already gone.
    }
  }

  // The reader of `from` stops while `to` holds more than it should, so one slow end slows its peer instead of filling the relay.
  function forward(frame: string, to: FrameSocket, from: FrameSocket): void {
    to.send(frame, () => {
      if (to.unsent() <= maxUnsentBytes) from.resume();
    });
    if (to.unsent() > maxUnsentBytes) from.pause();
  }

  return {
    connectDevice(link) {
      let socketId: string | undefined;
      let closed = false;
      return {
        receive(message) {
          if (closed) return;
          if (message.type === "hello") {
            const current = socketId ? devices.get(socketId) : undefined;
            // Another socket took this one's place, or the device was removed.
            if (socketId && !current) return;
            seen({ userId: link.userId, deviceId: link.deviceId, hostname: message.hostname, platform: message.platform });
            const agents = message.agents.map((agent) => ({ name: agent.name, agentType: agent.agentType }));
            if (current) {
              current.hostname = message.hostname;
              current.platform = message.platform;
              current.workingDirectory = message.workingDirectory;
              current.agents = agents;
              return;
            }
            // A device that reconnects before the relay noticed its old socket die. The newer socket takes over, so a device is online once.
            const previous = findDevice(link.userId, link.deviceId);
            if (previous) dropDevice(previous, "replaced");
            socketId = randomUUID();
            devices.set(socketId, {
              socketId,
              userId: link.userId,
              deviceId: link.deviceId,
              hostname: message.hostname,
              platform: message.platform,
              workingDirectory: message.workingDirectory,
              agents,
              send: link.send,
              close: link.close,
            });
            return;
          }
          if (!socketId) {
            link.close("invalid_message");
            return;
          }
          const connection = connections.get(message.connectionId);
          if (connection?.state !== "opening" || connection.deviceId !== link.deviceId || connection.userId !== link.userId) return;
          end(connection, undefined, { ok: false, status: 502, code: "agent_start_failed", message: message.message });
        },
        close() {
          closed = true;
          const device = socketId ? devices.get(socketId) : undefined;
          socketId = undefined;
          if (!device) return;
          devices.delete(device.socketId);
          seen({ userId: device.userId, deviceId: device.deviceId, hostname: device.hostname, platform: device.platform });
        },
      };
    },
    listDevices(userId) {
      return [...devices.values()]
        .filter((device) => device.userId === userId)
        .map((device) => ({
          id: device.deviceId,
          hostname: device.hostname,
          agents: device.agents,
          workingDirectory: device.workingDirectory,
          platform: device.platform,
        }));
    },
    listConnections(userId) {
      return [...connections.values()]
        .filter((connection) => connection.userId === userId)
        .map((connection) => ({ deviceId: connection.deviceId, agentName: connection.agentName, agentType: connection.agentType, clientId: connection.clientId }));
    },
    openConnection({ userId, clientId, deviceId, agentName }) {
      const device = findDevice(userId, deviceId);
      const agent = device?.agents.find((slot) => slot.name === agentName);
      if (!device || !agent) return Promise.resolve({ ok: false, status: 404, code: "target_not_found", message: "That device is not online, or does not offer that agent." });
      const id = randomBytes(16).toString("base64url");
      return new Promise((resolve) => {
        const connection: Connection = {
          id,
          userId,
          deviceId,
          agentName,
          agentType: agent.agentType,
          clientId,
          ticket: randomBytes(32).toString("base64url"),
          expiresAt: 0,
          state: "opening",
          held: [],
          timer: setTimeout(() => end(connection, undefined, deviceTimeout), openTimeoutMs),
          resolve,
        };
        connections.set(id, connection);
        try {
          device.send({ type: "open", connectionId: id, agentName });
        } catch {
          // The device socket is closing; the open times out.
        }
      });
    },
    acceptAgent({ connectionId, deviceId }, socket) {
      const connection = connections.get(connectionId);
      if (connection?.state !== "opening" || connection.deviceId !== deviceId) return undefined;
      // Nothing is read from the agent until a client attaches, so the agent waits instead of the relay holding its output.
      socket.pause();
      connection.agent = socket;
      connection.state = "issued";
      clearTimeout(connection.timer);
      connection.expiresAt = now() + ticketTtlMs;
      connection.timer = setTimeout(() => end(connection), ticketTtlMs);
      byTicket.set(connection.ticket, connection);
      const resolve = connection.resolve;
      connection.resolve = undefined;
      resolve?.({ ok: true, ticket: connection.ticket });
      return {
        frame(frame) {
          if (connection.state === "ended") return;
          if (connection.client) forward(frame, connection.client, socket);
          else connection.held.push(frame);
        },
        closed(agentExited) {
          connection.agent = undefined;
          end(connection, agentExited ? "agent_exited" : "device_gone");
        },
      };
    },
    acceptClient(ticket, socket) {
      const connection = byTicket.get(ticket);
      byTicket.delete(ticket);
      const agent = connection?.agent;
      if (!connection || !agent || connection.state !== "issued") return undefined;
      if (connection.expiresAt < now()) {
        end(connection);
        return undefined;
      }
      clearTimeout(connection.timer);
      connection.state = "attached";
      connection.client = socket;
      for (const frame of connection.held) forward(frame, socket, agent);
      connection.held = [];
      agent.resume();
      return {
        frame(frame) {
          if (connection.state !== "ended") forward(frame, agent, socket);
        },
        closed() {
          connection.client = undefined;
          end(connection);
        },
      };
    },
    removeDevice({ userId, deviceId }) {
      const device = findDevice(userId, deviceId);
      if (device) dropDevice(device, "revoked");
      for (const connection of connections.values()) {
        if (connection.userId === userId && connection.deviceId === deviceId) end(connection, "device_gone");
      }
    },
    revokeClient({ userId, clientId }) {
      for (const connection of connections.values()) {
        if (connection.userId === userId && connection.clientId === clientId) end(connection, "revoked");
      }
    },
  };
}
