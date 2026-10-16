import { StringDecoder } from "node:string_decoder";
import type { AgentSlot, DaemonMessage, RelayMessage } from "@exterior/contract";
import type { AgentLaunch } from "./acp-registry.js";
import type { StoredAgent } from "./config.js";
import { consumeAgentChunk, webSocketTextToAgentLine } from "./frames.js";
import { startProcess } from "./launch.js";

export type AgentPipe = {
  write(text: string): void;
  stop(): void;
};

export type AgentHooks = {
  onReady(): void;
  onFail(message: string): void;
  onFrame(payload: string): void;
  onClose(): void;
};

const maxFailureLength = 500;

export function createDaemonHost(input: {
  hostname: string;
  deviceId?: string;
  workingDirectory: string;
  agents: readonly StoredAgent[];
  send: (message: DaemonMessage) => void;
  resolveLaunch: (agent: StoredAgent) => AgentLaunch | undefined;
  spawnAgent?: (launch: AgentLaunch, hooks: AgentHooks, workingDirectory: string) => AgentPipe;
}): {
  hello(): void;
  /** Offers a new list from the next `open` on, and says hello again. Open sessions keep their agent. */
  setAgents(agents: readonly StoredAgent[]): void;
  receive(message: RelayMessage): void;
  close(): void;
} {
  const sessions = new Map<string, { pipe?: AgentPipe; opened: boolean }>();
  let configured = input.agents;

  const host = {
    hello() {
      const agents: AgentSlot[] = configured.flatMap((agent) =>
        input.resolveLaunch(agent) ? [{ name: agent.name, agentType: agent.agentType }] : [],
      );
      input.send({
        type: "hello",
        hostname: input.hostname.slice(0, 256),
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        workingDirectory: input.workingDirectory,
        agents,
      });
    },
    setAgents(agents: readonly StoredAgent[]) {
      configured = agents;
      host.hello();
    },
    receive(message: RelayMessage) {
      if (message.type === "open") {
        if (sessions.has(message.sessionId)) return;
        const agent = configured.find((item) => item.name === message.agentName);
        const launch = agent ? input.resolveLaunch(agent) : undefined;
        if (!agent || !launch) {
          input.send({ type: "open-failed", sessionId: message.sessionId, message: "That agent is not configured." });
          return;
        }
        const current: { pipe?: AgentPipe; opened: boolean } = { opened: false };
        sessions.set(message.sessionId, current);
        current.pipe = (input.spawnAgent ?? startAgent)(launch, {
          onReady() {
            current.opened = true;
            input.send({ type: "opened", sessionId: message.sessionId });
          },
          onFail(text) {
            sessions.delete(message.sessionId);
            input.send({ type: "open-failed", sessionId: message.sessionId, message: clip(text) });
          },
          onFrame(payload) {
            if (!current.opened) return;
            input.send({ type: "frame", sessionId: message.sessionId, payload });
          },
          onClose() {
            const live = sessions.get(message.sessionId);
            sessions.delete(message.sessionId);
            if (live?.opened) input.send({ type: "close", sessionId: message.sessionId });
          },
        }, input.workingDirectory);
        return;
      }
      const current = sessions.get(message.sessionId);
      if (!current?.pipe) return;
      if (message.type === "frame") {
        current.pipe.write(message.payload);
        return;
      }
      sessions.delete(message.sessionId);
      current.pipe.stop();
    },
    close() {
      const live = [...sessions.values()];
      sessions.clear();
      for (const current of live) current.pipe?.stop();
    },
  };
  return host;
}

export function startAgent(launch: AgentLaunch, hooks: AgentHooks, workingDirectory: string): AgentPipe {
  let started: ReturnType<typeof startProcess>;
  try {
    started = startProcess({
      executable: launch.executable,
      args: launch.args,
      env: { ...process.env, ...launch.env },
      workingDirectory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The agent did not start.";
    queueMicrotask(() => {
      hooks.onFail(message);
      hooks.onClose();
    });
    return { write() {}, stop() {} };
  }
  const { child } = started;
  let settled = false;
  let ready = false;
  const finish = (): void => {
    if (settled) return;
    settled = true;
    hooks.onClose();
  };
  const decoder = new StringDecoder("utf8");
  let pending = "";
  const takeStdout = (text: string): void => {
    const consumed = consumeAgentChunk(pending, text);
    pending = consumed.pending;
    for (const frame of consumed.frames) hooks.onFrame(frame);
    if (consumed.overflow) stop();
  };
  child.stdout?.on("data", (chunk: Buffer) => takeStdout(decoder.write(chunk)));
  child.stdout?.on("end", () => takeStdout(decoder.end()));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  child.on("spawn", () => {
    ready = true;
    hooks.onReady();
  });
  child.on("error", (error) => {
    if (!ready) hooks.onFail(error.message);
    finish();
  });
  child.on("exit", () => finish());
  const stop = (): void => started.stop(finish);
  return {
    write(text) {
      if (settled || !child.stdin?.writable) return;
      child.stdin.write(webSocketTextToAgentLine(text));
    },
    stop,
  };
}

function clip(message: string): string {
  const text = message.trim().slice(0, maxFailureLength);
  return text.length > 0 ? text : "The agent did not start.";
}
