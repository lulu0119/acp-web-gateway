import { openConnection, type OpenedAgent } from "./oauth.js";

export type AgentTarget = { deviceId: string; agentName: string };

export type OpenAgent = (target: AgentTarget) => Promise<OpenedAgent>;

/**
 * Owns the ticket lifecycle for one user intent: single-flight opens so one
 * click never starts two agents, and a new connection on retry, such as after
 * the socket closed with `ticket_rejected`. The agent socket and the ACP
 * session stay with the web app; each ticket is for a new connection, dialed once.
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
