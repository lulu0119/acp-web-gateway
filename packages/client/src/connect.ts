import {
  buildLaunchUrl,
  buildStatusUrl,
  buildWebSocketUrl,
  gatewayPortCandidates,
  parseStatusBody,
  type GatewayStatus,
} from "@mukae/contract";
import { chooseConnectAction, type StatusObservation } from "./choose-connect-action.js";
import { pickFreeGatewayPort } from "./pick-port.js";

export type ConnectOutcome =
  | { connected: true; url: string }
  | { connected: false; reason: "unconfigured" | "cancelled" | "not_ready" | "no_free_port" };

export const defaultReadyTimeoutMs = 60_000;

/** Published setup page. A web app passes this as `documentationUrl`. */
export const explainPageUrl = "https://lulu0119.github.io/mukae/explain/";
const pollIntervalMs = 250;

export type ConnectDependencies = {
  documentationUrl: string;
  agentType: string;
  port: number;
  readyTimeoutMs: number;
  origin: string;
  createNonce: () => string;
  openLaunchUrl: (url: string) => void;
  readStatus: (port: number) => Promise<StatusObservation>;
  goToDocumentation: (url: string) => void;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
};

/** Opens one more connection on a free port, so existing connections stay open. */
export async function connectLocalGateway(options: {
  documentationUrl: string;
  agentType: string;
  readyTimeoutMs?: number;
}): Promise<ConnectOutcome> {
  const port = await pickFreeGatewayPort({ candidates: gatewayPortCandidates, readStatus: readGatewayStatus });
  if (port === undefined) return { connected: false, reason: "no_free_port" };
  return runConnect({
    documentationUrl: options.documentationUrl,
    agentType: options.agentType,
    port,
    readyTimeoutMs: options.readyTimeoutMs ?? defaultReadyTimeoutMs,
    origin: window.location.origin,
    createNonce: () => crypto.randomUUID(),
    openLaunchUrl: openCustomScheme,
    readStatus: readGatewayStatus,
    goToDocumentation: (url) => window.location.assign(url),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
  });
}

export async function runConnect(input: ConnectDependencies): Promise<ConnectOutcome> {
  const nonce = input.createNonce();
  input.openLaunchUrl(
    buildLaunchUrl({ nonce, origin: input.origin, agentType: input.agentType, port: input.port }),
  );
  const started = input.now();
  while (true) {
    const observation = await input.readStatus(input.port);
    const elapsedMs = input.now() - started;
    const action = chooseConnectAction({
      observation,
      elapsedMs,
      readyTimeoutMs: input.readyTimeoutMs,
      documentationUrl: input.documentationUrl,
    });
    if (action.type === "wait") {
      await input.sleep(pollIntervalMs);
      continue;
    }
    if (action.type === "unconfigured") return { connected: false, reason: "unconfigured" };
    if (action.type === "cancelled") return { connected: false, reason: "cancelled" };
    if (action.type === "documentation") {
      input.goToDocumentation(action.url);
      return { connected: false, reason: "not_ready" };
    }
    return { connected: true, url: buildWebSocketUrl({ port: input.port, nonce }) };
  }
}

export async function readGatewayStatus(port: number): Promise<StatusObservation> {
  try {
    const response = await fetch(buildStatusUrl(port), { targetAddressSpace: "loopback" } as RequestInit);
    if (response.status === 403) return "rejected";
    if (!response.ok) return "unreachable";
    const status: GatewayStatus | undefined = parseStatusBody(await response.json());
    return status ?? "unreachable";
  } catch {
    return "unreachable";
  }
}

function openCustomScheme(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
