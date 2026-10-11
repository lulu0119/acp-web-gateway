import { daemonPath, parseRelayMessage, relayWebSocketUrl, type DaemonMessage } from "@mukae/contract";
import WebSocket from "ws";
import { commandOnPath, loadAcpRegistry, platformTarget, resolveStoredAgent, type RegistryAgent } from "./acp-registry.js";
import type { StoredAgent } from "./config.js";
import { createDaemonHost } from "./host.js";

export async function runDaemon(input: {
  relayUrl: string;
  accessToken: string;
  hostname: string;
  agents: readonly StoredAgent[];
  signal?: AbortSignal;
  catalog?: readonly RegistryAgent[];
}): Promise<void> {
  const loaded = input.catalog ? undefined : await loadAcpRegistry();
  const catalog = input.catalog ?? (loaded?.ok ? loaded.agents : []);
  while (!input.signal?.aborted) {
    const result = await connectOnce({ ...input, catalog });
    if (result === "unauthorized") throw new Error("Run mukae login again.");
    if (input.signal?.aborted) return;
    await delay(1_000, input.signal);
  }
}

function connectOnce(input: {
  relayUrl: string;
  accessToken: string;
  hostname: string;
  agents: readonly StoredAgent[];
  signal?: AbortSignal;
  catalog: readonly RegistryAgent[];
}): Promise<"closed" | "unauthorized"> {
  const socket = new WebSocket(relayWebSocketUrl(input.relayUrl, daemonPath), {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  let unauthorized = false;
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
    socket.close();
  };
  input.signal?.addEventListener("abort", stop, { once: true });
  return new Promise((resolve) => {
    socket.on("open", () => host.hello());
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
      response.resume();
    });
    socket.on("error", () => undefined);
    socket.on("close", () => {
      host.close();
      input.signal?.removeEventListener("abort", stop);
      resolve(unauthorized ? "unauthorized" : "closed");
    });
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
