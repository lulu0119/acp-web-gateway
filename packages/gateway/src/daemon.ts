import { daemonPath, parseRelayMessage, relayWebSocketUrl, type DaemonMessage } from "@mukae/contract";
import WebSocket from "ws";
import { commandOnPath, loadAcpRegistry, platformTarget, resolveStoredAgent, type RegistryAgent } from "./acp-registry.js";
import type { StoredAgent } from "./config.js";
import { createDaemonHost } from "./host.js";
import { DaemonLoginRequiredError } from "./login.js";

export async function runDaemon(input: {
  relayUrl: string;
  getAccessToken: (forceRefresh: boolean, signal?: AbortSignal) => Promise<string>;
  inform: (line: string) => void;
  hostname: string;
  agents: readonly StoredAgent[];
  signal?: AbortSignal;
  catalog?: readonly RegistryAgent[];
}): Promise<void> {
  const loaded = input.catalog ? undefined : await loadAcpRegistry();
  const catalog = input.catalog ?? (loaded?.ok ? loaded.agents : []);
  let authentication: "ready" | "refresh" | "refreshed" = "ready";
  let previousToken: string | undefined;
  let retryMs = 1_000;
  const retry = async () => {
    const ms = retryMs;
    retryMs = Math.min(retryMs * 2, 30_000);
    input.inform(`Retrying in ${ms / 1_000}s.`);
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
    const result = await connectOnce({ ...input, accessToken, catalog });
    if (input.signal?.aborted) return;
    if (result === "unauthorized") {
      if (authentication === "refreshed") throw new DaemonLoginRequiredError("Relay rejected the refreshed access token. Run mukae login again.");
      input.inform("Relay rejected the access token (HTTP 401). Refreshing credentials.");
      authentication = "refresh";
      continue;
    }
    if (result === "disconnected") {
      retryMs = 1_000;
      authentication = "ready";
    }
    await retry();
  }
}

function connectOnce(input: {
  relayUrl: string;
  accessToken: string;
  inform: (line: string) => void;
  hostname: string;
  agents: readonly StoredAgent[];
  signal?: AbortSignal;
  catalog: readonly RegistryAgent[];
}): Promise<"failed" | "disconnected" | "unauthorized"> {
  const socket = new WebSocket(relayWebSocketUrl(input.relayUrl, daemonPath), {
    headers: { authorization: `Bearer ${input.accessToken}` },
    handshakeTimeout: 10_000,
  });
  let unauthorized = false;
  let connected = false;
  const host = createDaemonHost({
    hostname: input.hostname,
    agents: input.agents,
    send(message: DaemonMessage) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    resolveLaunch(agent) {
      return resolveStoredAgent({
        agent,
        agents: input.catalog,
        platform: platformTarget(),
        commandExists: (command) => commandOnPath(command),
      });
    },
  });
  const stop = () => {
    host.close();
    socket.terminate();
  };
  return new Promise((resolve) => {
    socket.on("open", () => {
      connected = true;
      input.inform("Connected to relay.");
      host.hello();
    });
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const message = parseRelayMessage(parsed);
      if (message) host.receive(message);
    });
    socket.on("unexpected-response", (_request, response) => {
      if (response.statusCode === 401) unauthorized = true;
      input.inform(`Relay handshake failed (HTTP ${response.statusCode}).`);
      response.resume();
      socket.terminate();
    });
    socket.on("error", () => {
      if (!unauthorized && !input.signal?.aborted) input.inform("Relay connection failed.");
    });
    socket.on("close", (code) => {
      host.close();
      input.signal?.removeEventListener("abort", stop);
      if (!input.signal?.aborted && !unauthorized) input.inform(`Relay disconnected (code ${code}).`);
      resolve(unauthorized ? "unauthorized" : connected ? "disconnected" : "failed");
    });
    input.signal?.addEventListener("abort", stop, { once: true });
    if (input.signal?.aborted) stop();
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
