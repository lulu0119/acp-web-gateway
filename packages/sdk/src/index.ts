import * as v from "valibot";

export const daemonPath = "/api/daemon";
export const acpPath = "/api/acp";
/** Clients list devices here. */
export const devicesPath = "/api/devices";
export const connectionsPath = "/api/connections";
export const devicesScope = "devices offline_access";

export const protocolVersion = 1;

/** The largest frame, in UTF-8 bytes. */
export const frameBytes = 1_048_576;

/**
 * Why the relay closed an attach socket. Every close ends the connection.
 * `ticket_rejected`: the ticket is used, expired or unknown; open a new connection.
 * `agent_exited`: the agent ended. `device_gone`: the device socket closed, or the device was removed.
 * `revoked`: the client's authorization no longer permits the connection; sign in again before opening another.
 */
export const attachCloseCodes = { ticket_rejected: 4100, agent_exited: 4101, device_gone: 4102, revoked: 4103 } as const;
export type AttachCloseReason = keyof typeof attachCloseCodes;

/**
 * Why the relay closed a device socket. `replaced`: a newer socket for the device took over.
 * `revoked`: the device was removed or signed out, and must sign in again. `unsupported_version`: the relay does
 * not speak the `hello` version. `invalid_message`: the device sent a message the protocol does not allow.
 */
export const deviceCloseCodes = { replaced: 4200, revoked: 4201, unsupported_version: 4202, invalid_message: 4203 } as const;
export type DeviceCloseReason = keyof typeof deviceCloseCodes;

/** An error response's `code`. A client decides by it; an unknown one counts as `server_error`. */
export const errorCodes = [
  "invalid_request",
  "unauthorized",
  "insufficient_scope",
  "target_not_found",
  "agent_start_failed",
  "device_timeout",
  "rate_limited",
  "server_error",
] as const;
export type ErrorCode = (typeof errorCodes)[number];

/** The name of a close code, or undefined for one EAP does not define. */
export function closeReason<Codes extends Record<string, number>>(codes: Codes, code: number): keyof Codes | undefined {
  return (Object.keys(codes) as (keyof Codes)[]).find((name) => codes[name] === code);
}

const agentTypePattern = /^[a-z][a-z0-9-]{0,63}$/;
const idPattern = /^[A-Za-z0-9_-]{8,128}$/;
const connectionIdPattern = /^[A-Za-z0-9_-]{22,128}$/;
const namePattern = /^[^\r\n\t]{1,128}$/;
const maxFailureLength = 500;

/** The operating system a device reports, so a page can show it. */
export const devicePlatforms = ["macos", "windows", "linux"] as const;
export type DevicePlatform = (typeof devicePlatforms)[number];

const AgentTypeSchema = v.pipe(v.string(), v.regex(agentTypePattern));
const PlatformSchema = v.picklist(devicePlatforms);
const IdSchema = v.pipe(v.string(), v.regex(idPattern));
const NameSchema = v.pipe(v.string(), v.regex(namePattern));
const AgentSlotSchema = v.object({ name: NameSchema, agentType: AgentTypeSchema });
const HostnameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256));
const PathSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4096));
const ConnectionIdSchema = v.pipe(v.string(), v.regex(connectionIdPattern));
const PayloadSchema = v.pipe(v.string(), v.maxLength(frameBytes));
const FailureSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(maxFailureLength));

const HelloSchema = v.object({
  type: v.literal("hello"),
  protocolVersion: v.pipe(v.number(), v.integer()),
  hostname: HostnameSchema,
  deviceId: IdSchema,
  /**
   * The directory this device works in when a web app names none.
   *
   * A web app runs on another computer, so it cannot name a directory here.
   * It sends this one rather than `/`, which on the device is the root of a
   * drive or of the whole filesystem.
   */
  workingDirectory: PathSchema,
  agents: v.pipe(v.array(AgentSlotSchema), v.maxLength(32)),
  platform: PlatformSchema,
});
const FrameSchema = v.object({ type: v.literal("frame"), connectionId: ConnectionIdSchema, payload: PayloadSchema });
const CloseSchema = v.object({ type: v.literal("close"), connectionId: ConnectionIdSchema });
const OpenedSchema = v.object({ type: v.literal("opened"), connectionId: ConnectionIdSchema });
const OpenFailedSchema = v.object({ type: v.literal("open_failed"), connectionId: ConnectionIdSchema, message: FailureSchema });
const OpenSchema = v.object({ type: v.literal("open"), connectionId: ConnectionIdSchema, agentName: NameSchema });

const DaemonMessageSchema = v.variant("type", [HelloSchema, FrameSchema, CloseSchema, OpenedSchema, OpenFailedSchema]);
const RelayMessageSchema = v.variant("type", [OpenSchema, FrameSchema, CloseSchema]);
const daemonMessageTypes: readonly string[] = ["hello", "frame", "close", "opened", "open_failed"];
const relayMessageTypes: readonly string[] = ["open", "frame", "close"];

export type AgentSlot = v.InferOutput<typeof AgentSlotSchema>;

/** An online device as web apps see it. `id` is its device id. */
export type Device = {
  id: string;
  hostname: string;
  workingDirectory: string;
  agents: readonly AgentSlot[];
  platform: DevicePlatform;
};

export type DaemonMessage = v.InferOutput<typeof DaemonMessageSchema>;

export type RelayMessage = v.InferOutput<typeof RelayMessageSchema>;

export function isAgentType(value: string): boolean {
  return agentTypePattern.test(value);
}

export function relayWebSocketUrl(relayUrl: string, path: string): string {
  const url = new URL(path, relayUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * Reads a device socket message. `unknown` is a well-formed message of a type this version does not know,
 * which a receiver ignores. `invalid` is anything else that does not follow the protocol.
 */
export type Parsed<Message> = { ok: true; message: Message } | { ok: false; reason: "unknown" | "invalid" };

export function parseDaemonMessage(value: unknown): Parsed<DaemonMessage> {
  return parseMessage(DaemonMessageSchema, daemonMessageTypes, value);
}

export function parseRelayMessage(value: unknown): Parsed<RelayMessage> {
  return parseMessage(RelayMessageSchema, relayMessageTypes, value);
}

function parseMessage<Schema extends v.GenericSchema>(schema: Schema, types: readonly string[], value: unknown): Parsed<v.InferOutput<Schema>> {
  if (typeof value !== "object" || value === null || !("type" in value) || typeof value.type !== "string") return { ok: false, reason: "invalid" };
  if (!types.includes(value.type)) return { ok: false, reason: "unknown" };
  const parsed = v.safeParse(schema, value);
  return parsed.success ? { ok: true, message: parsed.output } : { ok: false, reason: "invalid" };
}
