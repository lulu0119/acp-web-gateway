export const defaultGatewayPort = 47321;
// Each connection runs its own gateway process on one port from this list.
export const gatewayPortCandidates: readonly number[] = Array.from({ length: 20 }, (_, index) => defaultGatewayPort + index);
export const launchScheme = "mukae";
export const launchCommand = "connect";
export const statusPath = "/status";
export const acpPath = "/acp";

export const gatewayStatuses = ["waiting", "choosing", "unconfigured", "cancelled"] as const;
export type GatewayStatus = (typeof gatewayStatuses)[number];

export const launchAgentTypes = ["claude-acp", "codex-acp", "gemini", "opencode"] as const;
export type LaunchAgentType = (typeof launchAgentTypes)[number];

const noncePattern = /^[A-Za-z0-9_-]{8,128}$/;
const agentTypePattern = /^[a-z][a-z0-9-]{0,63}$/;

export type AgentSlot = {
  name: string;
  agentType: string;
};

export type AgentSlotSelection =
  | { result: "use"; name: string }
  | { result: "choose"; names: readonly string[] }
  | { result: "unconfigured" };

export function buildLaunchUrl(input: { nonce: string; origin: string; agentType: string; port: number }): string {
  const url = new URL(`${launchScheme}://${launchCommand}`);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("origin", input.origin);
  url.searchParams.set("agentType", input.agentType);
  url.searchParams.set("port", String(input.port));
  return url.toString();
}

export type LaunchRequest = { nonce: string; origin: string; agentType: string; port: number };

export function parseLaunchUrl(value: string): LaunchRequest | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== `${launchScheme}:` || url.hostname !== launchCommand) {
    return undefined;
  }
  const nonce = url.searchParams.get("nonce");
  const origin = url.searchParams.get("origin");
  const agentType = url.searchParams.get("agentType");
  const port = Number(url.searchParams.get("port"));
  if (
    !nonce ||
    !isNonce(nonce) ||
    !origin ||
    !isHttpOrigin(origin) ||
    !agentType ||
    !isAgentType(agentType) ||
    !isGatewayPort(port)
  ) {
    return undefined;
  }
  return { nonce, origin, agentType, port };
}

export function isGatewayPort(value: number): boolean {
  return gatewayPortCandidates.includes(value);
}

export function isNonce(value: string): boolean {
  return noncePattern.test(value);
}

export function isAgentType(value: string): boolean {
  return agentTypePattern.test(value);
}

export function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

export function selectAgentSlots(input: { agentType: string; slots: readonly AgentSlot[] }): AgentSlotSelection {
  const names = input.slots.filter((slot) => slot.agentType === input.agentType).map((slot) => slot.name);
  const onlyName = names[0];
  if (names.length === 0 || onlyName === undefined) return { result: "unconfigured" };
  if (names.length === 1) return { result: "use", name: onlyName };
  return { result: "choose", names };
}

export function parseStatusBody(value: unknown): GatewayStatus | undefined {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return undefined;
  }
  const status = value.status;
  return gatewayStatuses.find((candidate) => candidate === status);
}

export function buildStatusUrl(port: number): string {
  return `http://127.0.0.1:${port}${statusPath}`;
}

export function buildWebSocketUrl(input: { port: number; nonce: string }): string {
  const url = new URL(`ws://127.0.0.1:${input.port}${acpPath}`);
  url.searchParams.set("nonce", input.nonce);
  return url.toString();
}
