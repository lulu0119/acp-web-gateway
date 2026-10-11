export const defaultRelayUrl = "http://127.0.0.1:8787";
export const daemonPath = "/api/daemon";
export const acpPath = "/api/acp";
export const machinesPath = "/api/machines";
export const sessionsPath = "/api/sessions";
export const exampleCallbackPath = "/oauth/callback";

export const publicClientsPath = "/api/clients";
export const machinesScope = "machines offline_access";

export type PublicClients = {
  exampleClientId: string;
  daemonClientId: string;
};

const agentTypePattern = /^[a-z][a-z0-9-]{0,63}$/;
const idPattern = /^[A-Za-z0-9_-]{8,128}$/;
const namePattern = /^[^\r\n\t]{1,128}$/;
const maxPayloadLength = 1_048_576;
const maxFailureLength = 500;

export type AgentSlot = {
  name: string;
  agentType: string;
};

export type Machine = {
  id: string;
  hostname: string;
  agents: readonly AgentSlot[];
};

export type DaemonMessage =
  | { type: "hello"; hostname: string; agents: readonly AgentSlot[] }
  | { type: "frame"; sessionId: string; payload: string }
  | { type: "close"; sessionId: string }
  | { type: "opened"; sessionId: string }
  | { type: "open-failed"; sessionId: string; message: string };

export type RelayMessage =
  | { type: "open"; sessionId: string; agentName: string }
  | { type: "frame"; sessionId: string; payload: string }
  | { type: "close"; sessionId: string };

export function isAgentType(value: string): boolean {
  return agentTypePattern.test(value);
}

export function relayWebSocketUrl(relayUrl: string, path: string): string {
  const url = new URL(path, relayUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function parseDaemonMessage(value: unknown): DaemonMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "hello") return parseHello(value);
  if (value.type === "frame") return parseFrame(value);
  if (value.type === "close") return parseClose(value);
  if (value.type === "opened") return parseOpened(value);
  if (value.type === "open-failed") return parseOpenFailed(value);
  return undefined;
}

export function parseRelayMessage(value: unknown): RelayMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "open") {
    if (!isId(value.sessionId) || !isName(value.agentName)) return undefined;
    return { type: "open", sessionId: value.sessionId, agentName: value.agentName };
  }
  if (value.type === "frame") return parseFrame(value);
  if (value.type === "close") return parseClose(value);
  return undefined;
}

function parseHello(value: Record<string, unknown>): DaemonMessage | undefined {
  if (typeof value.hostname !== "string" || value.hostname.length === 0 || value.hostname.length > 256) return undefined;
  if (!Array.isArray(value.agents) || value.agents.length > 32) return undefined;
  const agents: AgentSlot[] = [];
  for (const item of value.agents) {
    if (!isRecord(item) || !isName(item.name) || !isAgentType(stringOrEmpty(item.agentType))) return undefined;
    agents.push({ name: item.name, agentType: stringOrEmpty(item.agentType) });
  }
  return { type: "hello", hostname: value.hostname, agents };
}

function parseFrame(value: Record<string, unknown>): { type: "frame"; sessionId: string; payload: string } | undefined {
  if (!isId(value.sessionId) || typeof value.payload !== "string" || value.payload.length > maxPayloadLength) return undefined;
  return { type: "frame", sessionId: value.sessionId, payload: value.payload };
}

function parseClose(value: Record<string, unknown>): { type: "close"; sessionId: string } | undefined {
  if (!isId(value.sessionId)) return undefined;
  return { type: "close", sessionId: value.sessionId };
}

function parseOpened(value: Record<string, unknown>): { type: "opened"; sessionId: string } | undefined {
  if (!isId(value.sessionId)) return undefined;
  return { type: "opened", sessionId: value.sessionId };
}

function parseOpenFailed(value: Record<string, unknown>): DaemonMessage | undefined {
  if (!isId(value.sessionId) || typeof value.message !== "string" || value.message.length === 0 || value.message.length > maxFailureLength) {
    return undefined;
  }
  return { type: "open-failed", sessionId: value.sessionId, message: value.message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function isName(value: unknown): value is string {
  return typeof value === "string" && namePattern.test(value);
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}
