import { randomBytes, randomUUID } from "node:crypto";
import type { AgentSlot, DaemonMessage, Machine, RelayMessage } from "@mukae/contract";
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

type LiveMachine = {
  id: string;
  userId: string;
  deviceId?: string;
  hostname: string;
  agents: readonly AgentSlot[];
  send: (message: RelayMessage) => void;
};

type LiveSession = {
  id: string;
  userId: string;
  machineId: string;
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

/** A connected daemon, with the stable device id it announced, if any. */
export type LiveMachineInfo = Machine & { deviceId?: string };

/** Told when a daemon announces itself and when it disconnects, so the device's last-seen time can be kept. */
export type SeenDevice = (input: { userId: string; deviceId: string; hostname: string }) => void;

export type TakeTicketResult = { ok: true; link: BrowserLink } | { ok: false; reason: "used" | "expired" | "gone" };

export type Registry = {
  connectDaemon(input: { userId: string; send: (message: RelayMessage) => void }): {
    receive(message: DaemonMessage): void;
    close(): void;
  };
  listMachines(userId: string): LiveMachineInfo[];
  listSessions(userId: string): LiveSessionInfo[];
  openSession(input: { userId: string; machineId: string; agentName: string }): Promise<OpenSessionResult>;
  takeTicket(ticket: string, browser: BrowserSocket): TakeTicketResult;
};

export function createRegistry(input?: { now?: () => number; ticketTtlMs?: number; openTimeoutMs?: number; seen?: SeenDevice }): Registry {
  const now = input?.now ?? Date.now;
  const seen = input?.seen ?? (() => undefined);
  const ticketTtlMs = input?.ticketTtlMs ?? defaultTicketTtlMs;
  const openTimeoutMs = input?.openTimeoutMs ?? defaultOpenTimeoutMs;
  const machines = new Map<string, LiveMachine>();
  const sessions = new Map<string, LiveSession>();
  const sessionsByTicket = new Map<string, LiveSession>();

  function finishSession(session: LiveSession, source: "browser" | "daemon" | "timeout"): void {
    if (session.ended) return;
    session.ended = true;
    clearTimeout(session.openTimer);
    clearTimeout(session.ticketTimer);
    sessions.delete(session.id);
    sessionsByTicket.delete(session.ticket);
    if (source !== "daemon") sendToMachine(session.machineId, { type: "close", sessionId: session.id });
    if (source !== "browser") session.browser?.close();
    const resolve = session.openResolve;
    session.openResolve = undefined;
    resolve?.({ ok: false, status: source === "timeout" ? 504 : 503, message: "The machine did not start the agent." });
  }

  function sendToMachine(machineId: string, message: RelayMessage): void {
    const machine = machines.get(machineId);
    if (!machine) return;
    try {
      machine.send(message);
    } catch {
      machine.send = () => undefined;
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
        sendToMachine(session.machineId, { type: "frame", sessionId: session.id, payload });
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
      let machineId: string | undefined;
      return {
        receive(message) {
          if (message.type === "hello") {
            const agents = message.agents.map((agent) => ({ name: agent.name, agentType: agent.agentType }));
            if (message.deviceId) seen({ userId: link.userId, deviceId: message.deviceId, hostname: message.hostname });
            if (!machineId) {
              machineId = randomUUID();
              machines.set(machineId, {
                id: machineId,
                userId: link.userId,
                deviceId: message.deviceId,
                hostname: message.hostname,
                agents,
                send: link.send,
              });
              return;
            }
            const machine = machines.get(machineId);
            if (!machine) return;
            machine.deviceId = message.deviceId;
            machine.hostname = message.hostname;
            machine.agents = agents;
            return;
          }
          if (!machineId) return;
          const session = sessions.get(message.sessionId);
          if (!session || session.machineId !== machineId || session.ended) return;
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
          if (!machineId) return;
          const closedId = machineId;
          machineId = undefined;
          const closed = machines.get(closedId);
          if (closed?.deviceId) seen({ userId: closed.userId, deviceId: closed.deviceId, hostname: closed.hostname });
          machines.delete(closedId);
          for (const session of sessions.values()) {
            if (session.machineId === closedId) finishSession(session, "daemon");
          }
        },
      };
    },
    listMachines(userId) {
      return [...machines.values()]
        .filter((machine) => machine.userId === userId)
        .map((machine) => ({
          id: machine.id,
          hostname: machine.hostname,
          agents: machine.agents,
          ...(machine.deviceId ? { deviceId: machine.deviceId } : {}),
        }));
    },
    listSessions(userId) {
      return [...sessions.values()]
        .filter((session) => session.userId === userId && !session.ended)
        .map((session) => ({ machineId: session.machineId, agentName: session.agentName, agentType: session.agentType }));
    },
    openSession({ userId, machineId, agentName }) {
      const machine = machines.get(machineId);
      if (!machine || machine.userId !== userId) {
        return Promise.resolve({ ok: false, status: 404, message: "That machine is not online." });
      }
      const agent = machine.agents.find((slot) => slot.name === agentName);
      if (!agent) return Promise.resolve({ ok: false, status: 404, message: "That agent is not configured on the machine." });
      const id = randomUUID();
      const ticket = randomBytes(32).toString("base64url");
      return new Promise((resolve) => {
        const session: LiveSession = {
          id,
          userId,
          machineId,
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
        sendToMachine(machineId, { type: "open", sessionId: id, agentName });
      });
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
