import * as v from "valibot";

export const defaultRelayUrl = "http://127.0.0.1:8787";
export const daemonPath = "/api/daemon";
export const acpPath = "/api/acp";
export const machinesPath = "/api/machines";
export const sessionsPath = "/api/sessions";
export const exampleCallbackPath = "/oauth/callback";

export const publicClientsPath = "/api/clients";
export const clientRegistryPath = "/api/clients/register";
export const authorizeRequestPath = "/api/authorize-request";
export const grantsPath = "/api/grants";
export const machinesScope = "machines offline_access";

export type PublicClients = {
  daemonClientId: string;
};

const agentTypePattern = /^[a-z][a-z0-9-]{0,63}$/;
const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const idPattern = /^[A-Za-z0-9_-]{8,128}$/;
const namePattern = /^[^\r\n\t]{1,128}$/;
const maxPayloadLength = 1_048_576;
const maxFailureLength = 500;

const AgentTypeSchema = v.pipe(v.string(), v.regex(agentTypePattern));
const IdSchema = v.pipe(v.string(), v.regex(idPattern));
const NameSchema = v.pipe(v.string(), v.regex(namePattern));
const AgentSlotSchema = v.object({ name: NameSchema, agentType: AgentTypeSchema });
const HostnameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256));
const PayloadSchema = v.pipe(v.string(), v.maxLength(maxPayloadLength));
const FailureSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(maxFailureLength));

const HelloSchema = v.object({
  type: v.literal("hello"),
  hostname: HostnameSchema,
  agents: v.pipe(v.array(AgentSlotSchema), v.maxLength(32)),
});
const FrameSchema = v.object({ type: v.literal("frame"), sessionId: IdSchema, payload: PayloadSchema });
const CloseSchema = v.object({ type: v.literal("close"), sessionId: IdSchema });
const OpenedSchema = v.object({ type: v.literal("opened"), sessionId: IdSchema });
const OpenFailedSchema = v.object({ type: v.literal("open-failed"), sessionId: IdSchema, message: FailureSchema });
const OpenSchema = v.object({ type: v.literal("open"), sessionId: IdSchema, agentName: NameSchema });

const DaemonMessageSchema = v.variant("type", [HelloSchema, FrameSchema, CloseSchema, OpenedSchema, OpenFailedSchema]);
const RelayMessageSchema = v.variant("type", [OpenSchema, FrameSchema, CloseSchema]);

export type AgentSlot = v.InferOutput<typeof AgentSlotSchema>;

export type Machine = {
  id: string;
  hostname: string;
  agents: readonly AgentSlot[];
};

export type DaemonMessage = v.InferOutput<typeof DaemonMessageSchema>;

export type RelayMessage = v.InferOutput<typeof RelayMessageSchema>;

export function isAgentType(value: string): boolean {
  return agentTypePattern.test(value);
}

export function isEnvName(value: string): boolean {
  return envNamePattern.test(value);
}

export function relayWebSocketUrl(relayUrl: string, path: string): string {
  const url = new URL(path, relayUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function parseDaemonMessage(value: unknown): DaemonMessage | undefined {
  const parsed = v.safeParse(DaemonMessageSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function parseRelayMessage(value: unknown): RelayMessage | undefined {
  const parsed = v.safeParse(RelayMessageSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
