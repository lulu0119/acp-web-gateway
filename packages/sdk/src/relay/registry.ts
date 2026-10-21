import { randomBytes, randomUUID } from "node:crypto";
import { frameBytes, protocolVersion, type AgentSlot, type AttachCloseReason, type DaemonMessage, type Device, type DeviceCloseReason, type DevicePlatform, type RelayMessage } from "../index.js";

const defaultTicketTtlMs = 60_000;
const defaultOpenTimeoutMs = 15_000;

/** A live session, as an account's own pages list it. */
export type ConnectionInfo = {
  deviceId: string;
  agentName: string;
  agentType: string;
  /** The web app that opened the session. */
  clientId: string;
};

export type OpenSessionResult =
  | { ok: true; ticket: string; expiresAt: number; agentType: string; agentName: string }
  | { ok: false; status: 404 | 502 | 504; code: "target_not_found" | "agent_start_failed" | "device_timeout"; message: string };

export type BrowserSocket = {
  send(payload: string): void;
  close(reason: AttachCloseReason): void;
};

export type BrowserLink = {
  frame(payload: string): void;
  close(): void;
};

/** One daemon connection. Its id is the relay's own and changes on every reconnect; the device id does not. */
type LiveDaemon = {
  id: string;
  userId: string;
  deviceId: string;
  hostname: string;
  platform: DevicePlatform;
  workingDirectory: string;
  agents: readonly AgentSlot[];
  send: (message: RelayMessage) => void;
  close: (reason: DeviceCloseReason) => void;
};

type LiveSession = {
  id: string;
  userId: string;
  daemonId: string;
  deviceId: string;
  agentName: string;
  agentType: string;
  /** The web app that opened it. */
  clientId: string;
  ticket: string;
  expiresAt: number;
  ended: boolean;
  /** Frames the agent wrote before the socket attached, and their size in bytes. */
  held: string[];
  heldBytes: number;
  browser?: BrowserSocket;
  openTimer: ReturnType<typeof setTimeout>;
  ticketTimer?: ReturnType<typeof setTimeout>;
  openResolve?: (result: OpenSessionResult) => void;
};

/**
 * Told when a daemon announces itself and when it disconnects, so the device's last-seen time can be kept.
 * Answers false when the account has no such device, and the daemon is turned away.
 */
export type SeenDevice = (input: { userId: string; deviceId: string; hostname: string; platform: DevicePlatform }) => boolean;

/** A ticket that is used, expired or unknown is refused, and the dial ends there. */
export type TakeTicketResult = { ok: true; link: BrowserLink } | { ok: false };

export type Registry = {
  /** `close` ends the daemon's socket when the relay turns the daemon away. */
  connectDaemon(input: { userId: string; send: (message: RelayMessage) => void; close: (reason: DeviceCloseReason) => void }): {
    receive(message: DaemonMessage): void;
    close(): void;
  };
  listDevices(userId: string): Device[];
  listSessions(userId: string): ConnectionInfo[];
  openSession(input: { userId: string; clientId: string; deviceId: string; agentName: string }): Promise<OpenSessionResult>;
  /** Ends the device's connection and its sessions, as the device was removed. */
  disconnectDevice(input: { userId: string; deviceId: string }): void;
  takeTicket(ticket: string, browser: BrowserSocket): TakeTicketResult;
};

/**
 * Why a session ended. `browser`: its socket closed. `timeout`: the device did not answer, or nobody dialed the ticket.
 * `overflow`: the agent wrote more than a frame's worth before anybody dialed. The others are told to the socket.
 */
type Ending = "browser" | "timeout" | "overflow" | AttachCloseReason;

export function createRegistry(input?: { now?: () => number; ticketTtlMs?: number; openTimeoutMs?: number; seen?: SeenDevice }): Registry {
  const now = input?.now ?? Date.now;
  const seen = input?.seen ?? (() => true);
  const ticketTtlMs = input?.ticketTtlMs ?? defaultTicketTtlMs;
  const openTimeoutMs = input?.openTimeoutMs ?? defaultOpenTimeoutMs;
  const daemons = new Map<string, LiveDaemon>();
  const sessions = new Map<string, LiveSession>();
  const sessionsByTicket = new Map<string, LiveSession>();

  function finishSession(session: LiveSession, ending: Ending): void {
    if (session.ended) return;
    session.ended = true;
    clearTimeout(session.openTimer);
    clearTimeout(session.ticketTimer);
    sessions.delete(session.id);
    sessionsByTicket.delete(session.ticket);
    if (ending !== "agent_exited" && ending !== "device_gone") sendToDaemon(session.daemonId, { type: "close", connectionId: session.id });
    if (ending !== "browser" && ending !== "timeout" && ending !== "overflow") session.browser?.close(ending);
    const resolve = session.openResolve;
    session.openResolve = undefined;
    resolve?.(
      ending === "timeout"
        ? { ok: false, status: 504, code: "device_timeout", message: "The device did not answer." }
        : { ok: false, status: 502, code: "agent_start_failed", message: "The device did not start the agent." },
    );
  }

  function sendToDaemon(daemonId: string, message: RelayMessage): void {
    const daemon = daemons.get(daemonId);
    if (!daemon) return;
    try {
      daemon.send(message);
    } catch {
      daemon.send = () => undefined;
    }
  }

  function findDaemon(userId: string, deviceId: string): LiveDaemon | undefined {
    for (const daemon of daemons.values()) {
      if (daemon.userId === userId && daemon.deviceId === deviceId) return daemon;
    }
    return undefined;
  }

  function dropDaemon(daemon: LiveDaemon, reason: DeviceCloseReason): void {
    daemons.delete(daemon.id);
    for (const session of sessions.values()) {
      if (session.daemonId === daemon.id) finishSession(session, "device_gone");
    }
    try {
      daemon.close(reason);
    } catch {
      // The socket is already gone.
    }
  }

  function linkFor(session: LiveSession, browser: BrowserSocket): BrowserLink {
    return {
      frame(payload) {
        if (session.ended || session.browser !== browser) return;
        sendToDaemon(session.daemonId, { type: "frame", connectionId: session.id, payload });
      },
      close() {
        if (session.ended || session.browser !== browser) return;
        finishSession(session, "browser");
      },
    };
  }

  return {
    connectDaemon(link) {
      let daemonId: string | undefined;
      return {
        receive(message) {
          if (message.type === "hello") {
            if (message.protocolVersion !== protocolVersion) {
              link.close("unsupported_version");
              return;
            }
            const current = daemonId ? daemons.get(daemonId) : undefined;
            // Another connection took this one's place, or the device was removed.
            if (daemonId && !current) return;
            if (!seen({ userId: link.userId, deviceId: message.deviceId, hostname: message.hostname, platform: message.platform })) {
              if (current) dropDaemon(current, "revoked");
              else link.close("revoked");
              return;
            }
            // A daemon that reconnects before the relay noticed its old socket die announces the same
            // device id again. The newer connection takes over, so a device is online once.
            const previous = findDaemon(link.userId, message.deviceId);
            if (previous && previous !== current) dropDaemon(previous, "replaced");
            const agents = message.agents.map((agent) => ({ name: agent.name, agentType: agent.agentType }));
            if (current) {
              current.deviceId = message.deviceId;
              current.hostname = message.hostname;
              current.platform = message.platform;
              current.workingDirectory = message.workingDirectory;
              current.agents = agents;
              return;
            }
            daemonId = randomUUID();
            daemons.set(daemonId, {
              id: daemonId,
              userId: link.userId,
              deviceId: message.deviceId,
              hostname: message.hostname,
              platform: message.platform,
              workingDirectory: message.workingDirectory,
              agents,
              send: link.send,
              close: link.close,
            });
            return;
          }
          if (!daemonId) {
            link.close("invalid_message");
            return;
          }
          const session = sessions.get(message.connectionId);
          if (!session || session.daemonId !== daemonId || session.ended) {
            // The device holds a connection the relay does not, such as one whose open timed out: it stops the agent.
            if (message.type !== "close") sendToDaemon(daemonId, { type: "close", connectionId: message.connectionId });
            return;
          }
          if (message.type === "opened") {
            if (!session.openResolve) return;
            const resolve = session.openResolve;
            session.openResolve = undefined;
            clearTimeout(session.openTimer);
            session.expiresAt = now() + ticketTtlMs;
            session.ticketTimer = setTimeout(() => finishSession(session, "timeout"), ticketTtlMs);
            resolve({ ok: true, ticket: session.ticket, expiresAt: session.expiresAt, agentType: session.agentType, agentName: session.agentName });
            return;
          }
          if (message.type === "open_failed") {
            const resolve = session.openResolve;
            session.openResolve = undefined;
            clearTimeout(session.openTimer);
            session.ended = true;
            sessions.delete(session.id);
            sessionsByTicket.delete(session.ticket);
            resolve?.({ ok: false, status: 502, code: "agent_start_failed", message: message.message });
            return;
          }
          if (message.type === "frame") {
            if (session.browser) {
              session.browser.send(message.payload);
              return;
            }
            session.heldBytes += Buffer.byteLength(message.payload);
            if (session.heldBytes > frameBytes) {
              finishSession(session, "overflow");
              return;
            }
            session.held.push(message.payload);
            return;
          }
          finishSession(session, "agent_exited");
        },
        close() {
          if (!daemonId) return;
          const closed = daemons.get(daemonId);
          daemonId = undefined;
          if (!closed) return;
          seen({ userId: closed.userId, deviceId: closed.deviceId, hostname: closed.hostname, platform: closed.platform });
          daemons.delete(closed.id);
          for (const session of sessions.values()) {
            if (session.daemonId === closed.id) finishSession(session, "device_gone");
          }
        },
      };
    },
    listDevices(userId) {
      return [...daemons.values()]
        .filter((daemon) => daemon.userId === userId)
        .map((daemon) => ({
          id: daemon.deviceId,
          hostname: daemon.hostname,
          agents: daemon.agents,
          workingDirectory: daemon.workingDirectory,
          platform: daemon.platform,
        }));
    },
    listSessions(userId) {
      return [...sessions.values()]
        .filter((session) => session.userId === userId && !session.ended)
        .map((session) => ({ deviceId: session.deviceId, agentName: session.agentName, agentType: session.agentType, clientId: session.clientId }));
    },
    openSession({ userId, clientId, deviceId, agentName }) {
      const daemon = findDaemon(userId, deviceId);
      const agent = daemon?.agents.find((slot) => slot.name === agentName);
      if (!daemon || !agent) return Promise.resolve({ ok: false, status: 404, code: "target_not_found", message: "That device is not online, or does not offer that agent." });
      const id = randomBytes(16).toString("base64url");
      const ticket = randomBytes(32).toString("base64url");
      return new Promise((resolve) => {
        const session: LiveSession = {
          id,
          userId,
          daemonId: daemon.id,
          deviceId,
          agentName,
          agentType: agent.agentType,
          clientId,
          ticket,
          expiresAt: now() + ticketTtlMs,
          ended: false,
          held: [],
          heldBytes: 0,
          openTimer: setTimeout(() => finishSession(session, "timeout"), openTimeoutMs),
          openResolve: resolve,
        };
        sessions.set(id, session);
        sessionsByTicket.set(ticket, session);
        sendToDaemon(daemon.id, { type: "open", connectionId: id, agentName });
      });
    },
    disconnectDevice({ userId, deviceId }) {
      const daemon = findDaemon(userId, deviceId);
      if (daemon) dropDaemon(daemon, "revoked");
    },
    takeTicket(ticket, browser) {
      const session = sessionsByTicket.get(ticket);
      // Dialing consumes the ticket, whatever happens next.
      sessionsByTicket.delete(ticket);
      if (!session || session.ended || session.openResolve) return { ok: false };
      if (session.expiresAt < now()) {
        finishSession(session, "timeout");
        return { ok: false };
      }
      clearTimeout(session.ticketTimer);
      session.browser = browser;
      for (const payload of session.held) browser.send(payload);
      session.held = [];
      return { ok: true, link: linkFor(session, browser) };
    },
  };
}
