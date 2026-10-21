import type { ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { AgentSlot, DaemonMessage, DevicePlatform, RelayMessage } from "../index.js";
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

/** Starts the named agent in `workingDirectory`, or answers undefined when the device cannot start it. */
export type LaunchAgent = (agentName: string, hooks: AgentHooks, workingDirectory: string) => AgentPipe | undefined;

export type DeviceHost = {
  hello(): void;
  /** Offers a new list from the next `open` on, and says hello again. Open sessions keep their agent. */
  setAgents(agents: readonly AgentSlot[]): void;
  /** Sessions opened from here on work in `directory`. Open sessions keep the one they started in. */
  setWorkingDirectory(directory: string): void;
  receive(message: RelayMessage): void;
  /** Stops every agent, as the device socket is gone. */
  close(): void;
};

const maxFailureLength = 500;

/** Runs the agents of one device socket: one agent process per session the relay opens. */
export function createDeviceHost(input: {
  hostname: string;
  platform: DevicePlatform;
  deviceId: string;
  workingDirectory: string;
  agents: readonly AgentSlot[];
  send: (message: DaemonMessage) => void;
  launch: LaunchAgent;
}): DeviceHost {
  const sessions = new Map<string, { pipe?: AgentPipe; opened: boolean }>();
  let offered = input.agents;
  let workingDirectory = input.workingDirectory;

  const host: DeviceHost = {
    hello() {
      input.send({
        type: "hello",
        hostname: input.hostname.slice(0, 256),
        deviceId: input.deviceId,
        workingDirectory,
        agents: offered.map((agent) => ({ name: agent.name, agentType: agent.agentType })),
        platform: input.platform,
      });
    },
    setAgents(agents) {
      offered = agents;
      host.hello();
    },
    setWorkingDirectory(directory) {
      workingDirectory = directory;
      host.hello();
    },
    receive(message) {
      if (message.type === "open") {
        const { sessionId } = message;
        if (sessions.has(sessionId)) return;
        const notConfigured = () => input.send({ type: "open-failed", sessionId, message: "That agent is not configured." });
        if (!offered.some((agent) => agent.name === message.agentName)) {
          notConfigured();
          return;
        }
        const current: { pipe?: AgentPipe; opened: boolean } = { opened: false };
        sessions.set(sessionId, current);
        current.pipe = input.launch(message.agentName, {
          onReady() {
            current.opened = true;
            input.send({ type: "opened", sessionId });
          },
          onFail(text) {
            sessions.delete(sessionId);
            input.send({ type: "open-failed", sessionId, message: clip(text) });
          },
          onFrame(payload) {
            if (!current.opened) return;
            input.send({ type: "frame", sessionId, payload });
          },
          onClose() {
            const live = sessions.get(sessionId);
            sessions.delete(sessionId);
            if (live?.opened) input.send({ type: "close", sessionId });
          },
        }, workingDirectory);
        if (!current.pipe) {
          sessions.delete(sessionId);
          notConfigured();
        }
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

/**
 * Carries ACP over a started agent's standard streams: each frame is a line on its input, and each line it
 * writes is a frame. Standard error goes to this process's own. `stop` ends the agent and calls back once it has.
 */
export function carryAgent(child: ChildProcess, hooks: AgentHooks, stopChild: (onStopped: () => void) => void): AgentPipe {
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
  const stop = (): void => stopChild(finish);
  return {
    write(text) {
      if (settled || !child.stdin?.writable) return;
      child.stdin.write(webSocketTextToAgentLine(text));
    },
    stop,
  };
}

/** The platform to report for a Node.js `process.platform`, or none for a system EAP does not name. */
export function devicePlatform(nodePlatform: string): DevicePlatform | undefined {
  switch (nodePlatform) {
    case "darwin": return "macos";
    case "win32": return "windows";
    case "linux": return "linux";
    default: return undefined;
  }
}

function clip(message: string): string {
  const text = message.trim().slice(0, maxFailureLength);
  return text.length > 0 ? text : "The agent did not start.";
}
