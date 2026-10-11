import { openConnection } from "./oauth.js";

export type AgentTarget = { machineId: string; agentName: string };

export type OpenedAgent = { url: string; agentType: string; agentName: string };

export type TicketCloseReason = "ticket-used" | "ticket-expired" | "ticket-gone";

/**
 * Reads the relay's ticket close reason. The relay closes a rejected agent
 * socket with 1008 and one of these reasons; anything else is not a ticket
 * outcome. Old relays say only "ticket".
 */
export function parseTicketCloseReason(reason: string | undefined): TicketCloseReason | undefined {
  if (reason === "ticket-used" || reason === "ticket-expired" || reason === "ticket-gone") return reason;
  return undefined;
}

/**
 * Whether the socket died on a ticket outcome, so opening a fresh ticket is
 * the recovery. Every outcome takes a new ticket: sessions are never resumed.
 */
export function needsFreshTicket(reason: string | undefined): boolean {
  return parseTicketCloseReason(reason) !== undefined;
}

export type OpenAgent = (target: AgentTarget) => Promise<OpenedAgent>;

/**
 * Owns the ticket lifecycle for one user intent: single-flight opens so one
 * click never mints two tickets, and fresh tickets on retry so a dead ticket
 * never blocks the next dial. The agent socket and the ACP session stay with
 * the web app; this only hands out ticket URLs, always for a new session.
 */
export function createAgentConnector(input: {
  relayUrl: string;
  accessToken: string;
  target: AgentTarget;
  open?: OpenAgent;
}): { open(): Promise<OpenedAgent>; reopen(): Promise<OpenedAgent> } {
  const open = input.open ?? ((target) => openConnection(input.relayUrl, input.accessToken, target));
  let pending: Promise<OpenedAgent> | undefined;
  function fresh(): Promise<OpenedAgent> {
    const run = open(input.target).finally(() => {
      if (pending === run) pending = undefined;
    });
    pending = run;
    return run;
  }
  return {
    open() {
      return pending ?? fresh();
    },
    reopen() {
      // Abandon a racing open: the relay reaps the unused ticket on expiry.
      pending = undefined;
      return fresh();
    },
  };
}
