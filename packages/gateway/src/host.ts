import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { AgentSlot, DaemonMessage, RelayMessage } from "@mukae/contract";
import type { AgentLaunch } from "./acp-registry.js";
import type { StoredAgent } from "./config.js";
import { consumeAgentChunk, webSocketTextToAgentLine } from "./frames.js";

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
  agents: readonly StoredAgent[];
  send: (message: DaemonMessage) => void;
  resolveLaunch?: (agent: StoredAgent) => AgentLaunch | undefined;
  spawnAgent?: (agent: StoredAgent, launch: AgentLaunch, hooks: AgentHooks) => AgentPipe;
}): { hello(): void; receive(message: RelayMessage): void; close(): void } {
  const sessions = new Map<string, { pipe?: AgentPipe; opened: boolean }>();
  const resolveLaunch = input.resolveLaunch ?? customLaunch;

  return {
    hello() {
      const agents: AgentSlot[] = input.agents.flatMap((agent) =>
        resolveLaunch(agent) ? [{ name: agent.name, agentType: agent.agentType }] : [],
      );
      input.send({ type: "hello", hostname: input.hostname.slice(0, 256), ...(input.deviceId ? { deviceId: input.deviceId } : {}), agents });
    },
    receive(message) {
      if (message.type === "open") {
        if (sessions.has(message.sessionId)) return;
        const agent = input.agents.find((item) => item.name === message.agentName);
        const launch = agent ? resolveLaunch(agent) : undefined;
        if (!agent || !launch) {
          input.send({ type: "open-failed", sessionId: message.sessionId, message: "That agent is not configured." });
          return;
        }
        const current: { pipe?: AgentPipe; opened: boolean } = { opened: false };
        sessions.set(message.sessionId, current);
        current.pipe = (input.spawnAgent ?? startAgent)(agent, launch, {
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
        });
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
}

export function startAgent(_agent: StoredAgent, launch: AgentLaunch, hooks: AgentHooks): AgentPipe {
  const child = spawn(launch.command, [...launch.args], {
    env: { ...process.env, ...launch.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
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
  child.on("exit", finish);
  const stop = (): void => {
    child.kill();
    finish();
  };
  return {
    write(text) {
      if (settled || !child.stdin?.writable) return;
      child.stdin.write(webSocketTextToAgentLine(text));
    },
    stop,
  };
}

function customLaunch(agent: StoredAgent): AgentLaunch | undefined {
  if (!agent.command) return undefined;
  return { command: agent.command, args: agent.args ?? [], env: agent.env };
}

function clip(message: string): string {
  const text = message.trim().slice(0, maxFailureLength);
  return text.length > 0 ? text : "The agent did not start.";
}
