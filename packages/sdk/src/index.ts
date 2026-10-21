import * as v from "valibot";

export const daemonPath = "/api/daemon";
export const acpPath = "/api/acp";
/** Clients list devices here. */
export const devicesPath = "/api/devices";
export const connectionsPath = "/api/connections";
export const devicesScope = "devices offline_access";

/**
 * Why the relay closed a daemon's socket. `replaced`: a newer connection announced the same device id.
 * `removed`: the device is not registered to the account, because it was removed or never registered.
 */
export const daemonCloseCodes = { replaced: 4001, removed: 4003 } as const;

/** Why the relay refused an agent socket's ticket. It closes the socket with 1008 and one of these reasons. */
export const ticketCloseReasons = { used: "ticket-used", expired: "ticket-expired", gone: "ticket-gone" } as const;

const agentTypePattern = /^[a-z][a-z0-9-]{0,63}$/;
const idPattern = /^[A-Za-z0-9_-]{8,128}$/;
const namePattern = /^[^\r\n\t]{1,128}$/;
const maxPayloadLength = 1_048_576;
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
const PayloadSchema = v.pipe(v.string(), v.maxLength(maxPayloadLength));
const FailureSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(maxFailureLength));

const HelloSchema = v.object({
  type: v.literal("hello"),
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
const FrameSchema = v.object({ type: v.literal("frame"), sessionId: IdSchema, payload: PayloadSchema });
const CloseSchema = v.object({ type: v.literal("close"), sessionId: IdSchema });
const OpenedSchema = v.object({ type: v.literal("opened"), sessionId: IdSchema });
const OpenFailedSchema = v.object({ type: v.literal("open-failed"), sessionId: IdSchema, message: FailureSchema });
const OpenSchema = v.object({ type: v.literal("open"), sessionId: IdSchema, agentName: NameSchema });

const DaemonMessageSchema = v.variant("type", [HelloSchema, FrameSchema, CloseSchema, OpenedSchema, OpenFailedSchema]);
const RelayMessageSchema = v.variant("type", [OpenSchema, FrameSchema, CloseSchema]);

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

export function parseDaemonMessage(value: unknown): DaemonMessage | undefined {
  const parsed = v.safeParse(DaemonMessageSchema, value);
  return parsed.success ? parsed.output : undefined;
}

export function parseRelayMessage(value: unknown): RelayMessage | undefined {
  const parsed = v.safeParse(RelayMessageSchema, value);
  return parsed.success ? parsed.output : undefined;
}
