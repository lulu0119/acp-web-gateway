import { DeviceRegistrationError } from "@exterior/contract";
import { connectDevice, devicePlatform, type DeviceSocketEnd } from "@exterioragentprotocol/sdk/device";
import { loadAcpRegistry, platformTarget, resolveStoredAgent, type RegistryAgent } from "./acp-registry.js";
import { usableWorkingDirectory, type GatewayConfig } from "./config.js";
import { createDaemonHost } from "./host.js";
import { DaemonLoginRequiredError, loginAgain } from "./login.js";

type DaemonHost = ReturnType<typeof createDaemonHost>;

const maxRetryMs = 30_000;

export async function runDaemon(input: {
  relayUrl: string;
  getAccessToken: (forceRefresh: boolean, signal?: AbortSignal) => Promise<string>;
  inform: (line: string) => void;
  /** Called as the connection moves between connecting, connected, and waiting to retry. */
  onStatus?: (status: "connecting" | "connected" | "waiting") => void;
  hostname: string;
  deviceId: string;
  /** Registers the device before each connection, as the relay turns away a device it has no record of. */
  register?: (signal?: AbortSignal) => Promise<void>;
  /** The agents to offer and the directory their sessions work in. Its `workingDirectory` is already resolved. */
  config: GatewayConfig & { workingDirectory: string };
  /**
   * Delivers later configurations, each one with the directory already resolved. A change
   * reaches the relay without ending open sessions. Returns a function that unsubscribes.
   */
  configUpdates?: (listener: (config: GatewayConfig & { workingDirectory: string }) => void) => () => void;
  signal?: AbortSignal;
  catalog?: readonly RegistryAgent[];
  /** How often the daemon pings the relay. A ping still unanswered at the next one ends the connection, which then reconnects. */
  heartbeatMs?: number;
}): Promise<void> {
  // A directory deleted since it was set is made again before a session needs it.
  await usableWorkingDirectory(input.config.workingDirectory, input.inform);
  const loaded = input.catalog ? undefined : await loadAcpRegistry();
  const catalog = input.catalog ?? (loaded?.ok ? loaded.agents : []);
  let config = input.config;
  let host: DaemonHost | undefined;
  // Changes queue so a directory is made before the hello that carries it.
  let applied = Promise.resolve();
  const unsubscribe = input.configUpdates?.((next) => {
    applied = applied.then(async () => {
      // A directory that cannot be made keeps the last good one.
      if (next.workingDirectory !== config.workingDirectory) {
        const usable = await usableWorkingDirectory(next.workingDirectory, input.inform);
        if (!usable) return;
        host?.setWorkingDirectory(usable);
      }
      config = next;
      host?.setAgents(next.agents);
    });
  });
  try {
    await connectUntilStopped({
      ...input,
      catalog,
      currentConfig: () => config,
      onHost: (created) => (host = created),
    });
  } finally {
    unsubscribe?.();
  }
}

async function connectUntilStopped(input: {
  relayUrl: string;
  getAccessToken: (forceRefresh: boolean, signal?: AbortSignal) => Promise<string>;
  inform: (line: string) => void;
  onStatus?: (status: "connecting" | "connected" | "waiting") => void;
  hostname: string;
  deviceId: string;
  register?: (signal?: AbortSignal) => Promise<void>;
  currentConfig: () => GatewayConfig & { workingDirectory: string };
  onHost: (host: DaemonHost) => void;
  signal?: AbortSignal;
  catalog: readonly RegistryAgent[];
  heartbeatMs?: number;
}): Promise<void> {
  let authentication: "ready" | "refresh" | "refreshed" = "ready";
  let previousToken: string | undefined;
  let retryMs = 1_000;
  const retry = async () => {
    const ms = retryMs;
    retryMs = Math.min(retryMs * 2, maxRetryMs);
    input.inform(`Retrying in ${ms / 1_000}s.`);
    input.onStatus?.("waiting");
    await delay(ms, input.signal);
  };
  while (!input.signal?.aborted) {
    let accessToken: string;
    try {
      accessToken = await input.getAccessToken(authentication === "refresh", input.signal);
    } catch (error) {
      if (input.signal?.aborted) return;
      if (error instanceof DaemonLoginRequiredError) throw error;
      input.inform("Could not obtain an access token.");
      await retry();
      continue;
    }
    if (input.signal?.aborted) return;
    if (authentication === "refresh" || (previousToken !== undefined && previousToken !== accessToken)) input.inform("Access token refreshed.");
    previousToken = accessToken;
    if (authentication === "refresh") authentication = "refreshed";
    input.inform("Connecting to relay.");
    input.onStatus?.("connecting");
    const registered = await registerDevice(input);
    if (input.signal?.aborted) return;
    const result = registered === "registered" ? await connectOnce({ ...input, accessToken, config: input.currentConfig() }) : registered;
    if (input.signal?.aborted) return;
    if (result === "revoked") {
      throw new DaemonLoginRequiredError(`This device was removed from the account on the relay. ${loginAgain(input.relayUrl)}`);
    }
    if (result === "forbidden") {
      throw new DaemonLoginRequiredError(`Relay rejected this device (HTTP 403). ${loginAgain(input.relayUrl)}`);
    }
    if (result === "unauthorized") {
      if (authentication === "refreshed") throw new DaemonLoginRequiredError(`Relay rejected the refreshed access token. ${loginAgain(input.relayUrl)}`);
      input.inform("Relay rejected the access token (HTTP 401). Refreshing credentials.");
      authentication = "refresh";
      continue;
    }
    if (result === "disconnected") {
      retryMs = 1_000;
      authentication = "ready";
    }
    // Two daemons with one device id take each other's place on every connect, so this one waits longest.
    if (result === "replaced") {
      input.inform("A newer connection with this device's id took its place on the relay. Is this device's configuration copied to another computer?");
      retryMs = maxRetryMs;
      authentication = "ready";
    }
    if (result === "unsupported_version") {
      input.inform("The relay does not speak this version of Exterior's protocol. Update exterior.");
      retryMs = maxRetryMs;
    }
    await retry();
  }
}

async function registerDevice(input: {
  relayUrl: string;
  inform: (line: string) => void;
  register?: (signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}): Promise<"registered" | "unauthorized" | "failed"> {
  if (!input.register) return "registered";
  try {
    await input.register(input.signal);
    return "registered";
  } catch (error) {
    if (error instanceof DaemonLoginRequiredError) throw error;
    if (error instanceof DeviceRegistrationError && error.status === 401) return "unauthorized";
    // 403: the sign-in was revoked, such as by removing the device. 409: another account holds the device id.
    if (error instanceof DeviceRegistrationError && (error.status === 403 || error.status === 409)) {
      throw new DaemonLoginRequiredError(`${error.message} ${loginAgain(input.relayUrl)}`);
    }
    if (!input.signal?.aborted) input.inform(`Could not register this device: ${error instanceof Error ? error.message : "no reason given"}`);
    return "failed";
  }
}

function connectOnce(input: {
  relayUrl: string;
  accessToken: string;
  inform: (line: string) => void;
  onStatus?: (status: "connecting" | "connected" | "waiting") => void;
  hostname: string;
  deviceId: string;
  config: GatewayConfig & { workingDirectory: string };
  onHost: (host: DaemonHost) => void;
  signal?: AbortSignal;
  catalog: readonly RegistryAgent[];
  heartbeatMs?: number;
}): Promise<DeviceSocketEnd> {
  const platform = devicePlatform(process.platform);
  if (!platform) {
    input.inform("This operating system is not one Exterior reports.");
    return Promise.resolve("failed");
  }
  return connectDevice({
    relayUrl: input.relayUrl,
    accessToken: input.accessToken,
    inform: input.inform,
    onConnected: () => input.onStatus?.("connected"),
    heartbeatMs: input.heartbeatMs,
    signal: input.signal,
    host(send) {
      const host = createDaemonHost({
        hostname: input.hostname,
        platform,
        deviceId: input.deviceId,
        workingDirectory: input.config.workingDirectory,
        agents: input.config.agents,
        send,
        resolveLaunch(agent) {
          return resolveStoredAgent({
            agent,
            agents: input.catalog,
            platform: platformTarget(),
          });
        },
      });
      input.onHost(host);
      return host;
    },
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
