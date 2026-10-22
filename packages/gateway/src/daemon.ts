import { connectDevice, devicePlatform, type DeviceKey } from "@exterioragentprotocol/sdk/device";
import { loadAcpRegistry, platformTarget, resolveStoredAgent, type RegistryAgent } from "./acp-registry.js";
import { usableWorkingDirectory, type GatewayConfig } from "./config.js";
import { createDaemonHost } from "./host.js";
import { DaemonLoginRequiredError, loginAgain } from "./login.js";

type DaemonHost = ReturnType<typeof createDaemonHost>;

const maxRetryMs = 30_000;

export async function runDaemon(input: {
  relayUrl: string;
  /** The key the device's tokens are bound to. Every socket proves it. */
  deviceKey: DeviceKey;
  getAccessToken: (forceRefresh: boolean, signal?: AbortSignal) => Promise<string>;
  inform: (line: string) => void;
  /** Called as the connection moves between connecting, connected, and waiting to retry. */
  onStatus?: (status: "connecting" | "connected" | "waiting") => void;
  hostname: string;
  /** The agents to offer and the directory their agents work in. Its `workingDirectory` is already resolved. */
  config: GatewayConfig & { workingDirectory: string };
  /**
   * Delivers later configurations, each one with the directory already resolved. A change
   * reaches the relay without ending running agents. Returns a function that unsubscribes.
   */
  configUpdates?: (listener: (config: GatewayConfig & { workingDirectory: string }) => void) => () => void;
  signal?: AbortSignal;
  catalog?: readonly RegistryAgent[];
  /** How often the daemon pings the relay. A ping still unanswered at the next one ends the socket, which then reconnects. */
  heartbeatMs?: number;
}): Promise<void> {
  const platform = devicePlatform(process.platform);
  if (!platform) throw new Error("This operating system is not one Exterior reports.");
  // A directory deleted since it was set is made again before an agent needs it.
  await usableWorkingDirectory(input.config.workingDirectory, input.inform);
  const loaded = input.catalog ? undefined : await loadAcpRegistry();
  const catalog = input.catalog ?? (loaded?.ok ? loaded.agents : []);
  let config = input.config;
  // One host for the whole run: its agents keep running while the device socket reconnects.
  const host = createDaemonHost({
    relayUrl: input.relayUrl,
    deviceKey: input.deviceKey,
    hostname: input.hostname,
    platform,
    workingDirectory: config.workingDirectory,
    agents: config.agents,
    heartbeatMs: input.heartbeatMs,
    resolveLaunch(agent) {
      return resolveStoredAgent({ agent, agents: catalog, platform: platformTarget() });
    },
  });
  // Changes queue so a directory is made before the hello that carries it.
  let applied = Promise.resolve();
  const unsubscribe = input.configUpdates?.((next) => {
    applied = applied.then(async () => {
      // A directory that cannot be made keeps the last good one.
      if (next.workingDirectory !== config.workingDirectory) {
        const usable = await usableWorkingDirectory(next.workingDirectory, input.inform);
        if (!usable) return;
        host.setWorkingDirectory(usable);
      }
      config = next;
      host.setAgents(next.agents);
    });
  });
  try {
    await connectUntilStopped({ ...input, host });
  } finally {
    unsubscribe?.();
    host.stop();
  }
}

async function connectUntilStopped(input: {
  relayUrl: string;
  getAccessToken: (forceRefresh: boolean, signal?: AbortSignal) => Promise<string>;
  inform: (line: string) => void;
  onStatus?: (status: "connecting" | "connected" | "waiting") => void;
  host: DaemonHost;
  deviceKey: DeviceKey;
  signal?: AbortSignal;
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
    const result = await connectDevice({
      relayUrl: input.relayUrl,
      accessToken,
      deviceKey: input.deviceKey,
      host: input.host,
      inform: input.inform,
      onConnected: () => input.onStatus?.("connected"),
      heartbeatMs: input.heartbeatMs,
      signal: input.signal,
    });
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
    // Two daemons with one sign-in take each other's place on every connect, so this one waits longest.
    if (result === "replaced") {
      input.inform("A newer connection with this device's sign-in took its place on the relay. Is this device's configuration copied to another computer?");
      retryMs = maxRetryMs;
      authentication = "ready";
    }
    if (result === "unsupported_version") {
      input.inform("The relay does not speak this version of the Exterior Agent Protocol. Update exterior.");
      retryMs = maxRetryMs;
    }
    await retry();
  }
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
