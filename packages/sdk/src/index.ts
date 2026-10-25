import * as v from "valibot";

/** Where an authorization server is found for a relay (RFC 9728). */
export const protectedResourcePath = "/.well-known/oauth-protected-resource";
/** EAP v1's endpoints. A later version that changes one serves it under a new path. Clients list devices here. */
export const devicesPath = "/eap/v1/devices";
export const connectionsPath = "/eap/v1/connections";
/** A device keeps one socket open here, for `hello`, `open` and `open_failed`. */
export const deviceSocketPath = "/eap/v1/device";

/** Where a device dials the agent socket of one connection. */
export function agentSocketPath(connectionId: string): string {
  return `${deviceSocketPath}/connections/${connectionId}`;
}

/** A client opens an MCP endpoint here, which it serves from its page while it holds the endpoint's socket. */
export const mcpEndpointsPath = "/eap/v1/mcp-endpoints";

/** The scope of a client's token: it lists devices and opens connections. */
export const clientScope = "eap:client";
/** The scope of a device's token: it opens the device socket. */
export const deviceScope = "eap:device";

/** The largest frame, in UTF-8 bytes. */
export const frameBytes = 1_048_576;

/**
 * Why the relay closed an attach socket. Every close ends the connection.
 * `ticket_rejected`: the ticket is used, expired or unknown; open a new connection.
 * `agent_exited`: the agent ended. `device_gone`: the agent socket closed without the agent ending, or the device was removed.
 * `revoked`: the client's authorization no longer permits the connection; sign in again before opening another.
 */
export const attachCloseCodes = { ticket_rejected: 4100, agent_exited: 4101, device_gone: 4102, revoked: 4103 } as const;
export type AttachCloseReason = keyof typeof attachCloseCodes;

/**
 * Why the relay closed a device socket. `replaced`: a newer socket for the device took over.
 * `revoked`: the device was removed or signed out, and must sign in again. A message the protocol does not allow
 * closes it with 1008.
 */
export const deviceCloseCodes = { replaced: 4200, revoked: 4201 } as const;
export type DeviceCloseReason = keyof typeof deviceCloseCodes;

/**
 * Why the relay closed an MCP socket. Every close ends the MCP endpoint.
 * `ticket_rejected`: the ticket is used, expired or unknown; open a new endpoint.
 * `revoked`: the client's authorization no longer permits the endpoint; sign in again before opening another.
 * A frame that does not follow the protocol closes it with 1008.
 */
export const mcpSocketCloseCodes = { ticket_rejected: 4300, revoked: 4301 } as const;
export type McpSocketCloseReason = keyof typeof mcpSocketCloseCodes;

/** The largest frame on an MCP socket, in UTF-8 bytes. A tool result may carry an image. */
export const mcpFrameBytes = 16_777_216;

/**
 * A frame on an MCP socket. `session` is the MCP session (`Mcp-Session-Id`) the message belongs to, and each MCP
 * session is one MCP server on the page. The relay sends `closed` once a session ends; the page sends only messages.
 * `relatedRequestId` names the request a notification belongs to, so the relay sends it on that request's response.
 */
export type McpFrame =
  | { session: string; message: object; relatedRequestId?: string | number }
  | { session: string; closed: true };

/** An error response's `code`. A client decides by it; an unknown one counts as `server_error`. */
export const errorCodes = [
  "invalid_request",
  "unauthorized",
  "insufficient_scope",
  "target_not_found",
  "agent_start_failed",
  "device_timeout",
  "server_error",
] as const;
export type ErrorCode = (typeof errorCodes)[number];

/** The name of a close code, or undefined for one EAP does not define. */
export function closeReason<Codes extends Record<string, number>>(codes: Codes, code: number): keyof Codes | undefined {
  return (Object.keys(codes) as (keyof Codes)[]).find((name) => codes[name] === code);
}

const agentTypePattern = /^[a-z][a-z0-9-]{0,63}$/;
const connectionIdPattern = /^[A-Za-z0-9_-]{22,128}$/;
const namePattern = /^[^\r\n\t]{1,128}$/;

/** The longest `open_failed` message, in characters. */
export const maxFailureLength = 500;

/** The operating system a device reports, so a page can show it. */
export const devicePlatforms = ["macos", "windows", "linux"] as const;
export type DevicePlatform = (typeof devicePlatforms)[number];

const AgentTypeSchema = v.pipe(v.string(), v.regex(agentTypePattern));
const PlatformSchema = v.picklist(devicePlatforms);
const NameSchema = v.pipe(v.string(), v.regex(namePattern));
const AgentSlotSchema = v.object({ name: NameSchema, agentType: AgentTypeSchema });
const HostnameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256));
const PathSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4096));
const ConnectionIdSchema = v.pipe(v.string(), v.regex(connectionIdPattern));
const FailureSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(maxFailureLength));

const HelloSchema = v.object({
  type: v.literal("hello"),
  hostname: HostnameSchema,
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
const OpenFailedSchema = v.object({ type: v.literal("open_failed"), connectionId: ConnectionIdSchema, message: FailureSchema });
const OpenSchema = v.object({ type: v.literal("open"), connectionId: ConnectionIdSchema, agentName: NameSchema });

const DeviceMessageSchema = v.variant("type", [HelloSchema, OpenFailedSchema]);
const deviceMessageTypes: readonly string[] = ["hello", "open_failed"];

const DeviceSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  hostname: HostnameSchema,
  workingDirectory: PathSchema,
  agents: v.pipe(v.array(AgentSlotSchema), v.readonly()),
  platform: PlatformSchema,
});

export type AgentSlot = v.InferOutput<typeof AgentSlotSchema>;

/** An online device as web apps see it. `id` is its device id, the thumbprint of its key. */
export type Device = v.InferOutput<typeof DeviceSchema>;

/** What a device sends on its device socket. */
export type DeviceMessage = v.InferOutput<typeof DeviceMessageSchema>;

/** What the relay sends on a device socket. */
export type RelayMessage = v.InferOutput<typeof OpenSchema>;

export function isAgentType(value: string): boolean {
  return agentTypePattern.test(value);
}

export function isDevice(value: unknown): value is Device {
  return v.is(DeviceSchema, value);
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

export function parseDeviceMessage(value: unknown): Parsed<DeviceMessage> {
  return parseMessage(DeviceMessageSchema, deviceMessageTypes, value);
}

export function parseRelayMessage(value: unknown): Parsed<RelayMessage> {
  return parseMessage(OpenSchema, ["open"], value);
}

function parseMessage<Schema extends v.GenericSchema>(schema: Schema, types: readonly string[], value: unknown): Parsed<v.InferOutput<Schema>> {
  if (typeof value !== "object" || value === null || !("type" in value) || typeof value.type !== "string") return { ok: false, reason: "invalid" };
  if (!types.includes(value.type)) return { ok: false, reason: "unknown" };
  const parsed = v.safeParse(schema, value);
  return parsed.success ? { ok: true, message: parsed.output } : { ok: false, reason: "invalid" };
}

const McpFrameSchema = v.union([
  v.strictObject({ session: v.pipe(v.string(), v.minLength(1)), message: v.looseObject({}), relatedRequestId: v.optional(v.union([v.string(), v.number()])) }),
  v.strictObject({ session: v.pipe(v.string(), v.minLength(1)), closed: v.literal(true) }),
]);

/** Reads an MCP socket frame, or undefined for one that does not follow the protocol. */
export function parseMcpFrame(value: unknown): McpFrame | undefined {
  const parsed = v.safeParse(McpFrameSchema, value);
  return parsed.success ? parsed.output : undefined;
}

/** Reads a socket's JSON text, or undefined when it is not JSON. */
export function parseJson(text: string): unknown {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson()), text);
  return parsed.success ? parsed.output : undefined;
}
