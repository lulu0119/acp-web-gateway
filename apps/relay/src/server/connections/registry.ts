import { randomBytes, randomUUID } from "node:crypto";
import type { AgentSlot, DaemonMessage, Device, RelayMessage } from "@exterior/contract";
import type { LiveSessionInfo } from "../../shared/account-web.js";

const defaultTicketTtlMs = 60_000;
const defaultOpenTimeoutMs = 15_000;

export type OpenSessionResult =
  | { ok: true; ticket: string; agentType: string; agentName: string }
  | { ok: false; status: 404 | 502 | 503 | 504; message: string };

export type BrowserSocket = {
  send(payload: string): void;
  close(): void;
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
  workingDirectory: string;
  agents: readonly AgentSlot[];
  send: (message: RelayMessage) => void;
  close: (reason: DaemonCloseReason) => void;
};

type LiveSession = {
  id: string;
  userId: string;
  daemonId: string;
  deviceId: string;
  agentName: string;
  agentType: string;
  ticket: string;
  expiresAt: number;
  ended: boolean;
  live: boolean;
  buffer: string[];
  browser?: BrowserSocket;
  openTimer: ReturnType<typeof setTimeout>;
  ticketTimer?: ReturnType<typeof setTimeout>;
  openResolve?: (result: OpenSessionResult) => void;
};

/** `replaced`: a newer connection announced the same device id. `removed`: the account has no such device. */
export type DaemonCloseReason = "replaced" | "removed";

/**
 * Told when a daemon announces itself and when it disconnects, so the device's last-seen time can be kept.
 * Answers false when the account has no such device, and the daemon is turned away.
 */
export type SeenDevice = (input: { userId: string; deviceId: string; hostname: string }) => boolean;

export type TakeTicketResult = { ok: true; link: BrowserLink } | { ok: false; reason: "used" | "expired" | "gone" };

export type Registry = {
  /** `close` ends the daemon's socket when the relay turns the daemon away. */
  connectDaemon(input: { userId: string; send: (message: RelayMessage) => void; close: (reason: DaemonCloseReason) => void }): {
    receive(message: DaemonMessage): void;
    close(): void;
  };
  listDevices(userId: string): Device[];
  listSessions(userId: string): LiveSessionInfo[];
  openSession(input: { userId: string; deviceId: string; agentName: string }): Promise<OpenSessionResult>;
  /** Ends the device's connection and its sessions, as the device was removed. */
  disconnectDevice(input: { userId: string; deviceId: string }): void;
  takeTicket(ticket: string, browser: BrowserSocket): TakeTicketResult;
};

export function createRegistry(input?: { now?: () => number; ticketTtlMs?: number; openTimeoutMs?: number; seen?: SeenDevice }): Registry {
  const now = input?.now ?? Date.now;
  const seen = input?.seen ?? (() => true);
  const ticketTtlMs = input?.ticketTtlMs ?? defaultTicketTtlMs;
  const openTimeoutMs = input?.openTimeoutMs ?? defaultOpenTimeoutMs;
  const daemons = new Map<string, LiveDaemon>();
  const sessions = new Map<string, LiveSession>();
  const sessionsByTicket = new Map<string, LiveSession>();

  function finishSession(session: LiveSession, source: "browser" | "daemon" | "timeout"): void {
    if (session.ended) return;
    session.ended = true;
    clearTimeout(session.openTimer);
    clearTimeout(session.ticketTimer);
    sessions.delete(session.id);
    sessionsByTicket.delete(session.ticket);
    if (source !== "daemon") sendToDaemon(session.daemonId, { type: "close", sessionId: session.id });
    if (source !== "browser") session.browser?.close();
    const resolve = session.openResolve;
    session.openResolve = undefined;
    resolve?.({ ok: false, status: source === "timeout" ? 504 : 503, message: "The device did not start the agent." });
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

  function dropDaemon(daemon: LiveDaemon, reason: DaemonCloseReason): void {
    daemons.delete(daemon.id);
    for (const session of sessions.values()) {
      if (session.daemonId === daemon.id) finishSession(session, "daemon");
    }
    try {
      daemon.close(reason);
    } catch {
      // The socket is already gone.
    }
  }

  // The first ACP frame in either direction makes the session live and
  // consumes the ticket. Until then the socket is an infant: it may die or
  // be superseded without ending the session. The ticket mapping stays so a
  // retake on a live ticket reports "used"; it leaves with the session.
  function markLive(session: LiveSession): void {
    if (session.live || session.ended) return;
    session.live = true;
    clearTimeout(session.ticketTimer);
  }

  function linkFor(session: LiveSession, browser: BrowserSocket): BrowserLink {
    return {
      frame(payload) {
        if (session.ended || session.browser !== browser) return;
        markLive(session);
        sendToDaemon(session.daemonId, { type: "frame", sessionId: session.id, payload });
      },
      close() {
        if (session.ended || session.browser !== browser) return;
        if (!session.live) {
          // An infant socket died before any ACP frame flowed: detach it
          // and keep the ticket claimable until it expires.
          session.browser = undefined;
          return;
        }
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
            const current = daemonId ? daemons.get(daemonId) : undefined;
            // Another connection took this one's place, or the device was removed.
            if (daemonId && !current) return;
            if (!seen({ userId: link.userId, deviceId: message.deviceId, hostname: message.hostname })) {
              if (current) dropDaemon(current, "removed");
              else link.close("removed");
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
              workingDirectory: message.workingDirectory,
              agents,
              send: link.send,
              close: link.close,
            });
            return;
          }
          if (!daemonId) return;
          const session = sessions.get(message.sessionId);
          if (!session || session.daemonId !== daemonId || session.ended) return;
          if (message.type === "opened") {
            if (!session.openResolve) return;
            const resolve = session.openResolve;
            session.openResolve = undefined;
            clearTimeout(session.openTimer);
            session.expiresAt = now() + ticketTtlMs;
            session.ticketTimer = setTimeout(() => finishSession(session, "timeout"), ticketTtlMs);
            resolve({ ok: true, ticket: session.ticket, agentType: session.agentType, agentName: session.agentName });
            return;
          }
          if (message.type === "open-failed") {
            const resolve = session.openResolve;
            session.openResolve = undefined;
            clearTimeout(session.openTimer);
            session.ended = true;
            sessions.delete(session.id);
            sessionsByTicket.delete(session.ticket);
            resolve?.({ ok: false, status: 502, message: message.message });
            return;
          }
          if (message.type === "frame") {
            if (session.browser) {
              session.browser.send(message.payload);
              markLive(session);
            }
            else if (session.buffer.length < 32) session.buffer.push(message.payload);
            return;
          }
          finishSession(session, "daemon");
        },
        close() {
          if (!daemonId) return;
          const closed = daemons.get(daemonId);
          daemonId = undefined;
          if (!closed) return;
          seen({ userId: closed.userId, deviceId: closed.deviceId, hostname: closed.hostname });
          daemons.delete(closed.id);
          for (const session of sessions.values()) {
            if (session.daemonId === closed.id) finishSession(session, "daemon");
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
        }));
    },
    listSessions(userId) {
      return [...sessions.values()]
        .filter((session) => session.userId === userId && !session.ended)
        .map((session) => ({ deviceId: session.deviceId, agentName: session.agentName, agentType: session.agentType }));
    },
    openSession({ userId, deviceId, agentName }) {
      const daemon = findDaemon(userId, deviceId);
      if (!daemon) return Promise.resolve({ ok: false, status: 404, message: "That device is not online." });
      const agent = daemon.agents.find((slot) => slot.name === agentName);
      if (!agent) return Promise.resolve({ ok: false, status: 404, message: "That agent is not configured on the device." });
      const id = randomUUID();
      const ticket = randomBytes(32).toString("base64url");
      return new Promise((resolve) => {
        const session: LiveSession = {
          id,
          userId,
          daemonId: daemon.id,
          deviceId,
          agentName,
          agentType: agent.agentType,
          ticket,
          expiresAt: now() + ticketTtlMs,
          ended: false,
          live: false,
          buffer: [],
          openTimer: setTimeout(() => finishSession(session, "timeout"), openTimeoutMs),
          openResolve: resolve,
        };
        sessions.set(id, session);
        sessionsByTicket.set(ticket, session);
        sendToDaemon(daemon.id, { type: "open", sessionId: id, agentName });
      });
    },
    disconnectDevice({ userId, deviceId }) {
      const daemon = findDaemon(userId, deviceId);
      if (daemon) dropDaemon(daemon, "removed");
    },
    takeTicket(ticket, browser) {
      const session = sessionsByTicket.get(ticket);
      if (!session || session.ended) return { ok: false as const, reason: "gone" as const };
      if (session.expiresAt < now()) {
        finishSession(session, "timeout");
        return { ok: false as const, reason: "expired" as const };
      }
      if (session.browser && session.live) return { ok: false as const, reason: "used" as const };
      if (session.browser) {
        // An infant socket never went live: supersede it. At most one
        // browser socket owns the session at a time.
        try {
          session.browser.close();
        } catch {
          // The stale socket is already gone; the new one still takes over.
        }
      }
      session.browser = browser;
      const buffered = session.buffer;
      session.buffer = [];
      for (const payload of buffered) browser.send(payload);
      if (buffered.length > 0) markLive(session);
      return { ok: true as const, link: linkFor(session, browser) };
    },
  };
}
