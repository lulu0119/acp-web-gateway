import type { ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import WebSocket from "ws";
import { dpopProof, type DeviceKey } from "../dpop.js";
import { heartbeat } from "../heartbeat.js";
import { agentSocketPath, frameBytes, relayWebSocketUrl, type AgentSlot, type DeviceMessage, type DevicePlatform, type RelayMessage } from "../index.js";
import { consumeAgentChunk, webSocketTextToAgentLine } from "./frames.js";

/** An agent process the device started. `stop` ends it, with its whole tree, and calls back once it has. */
export type StartedAgent = { child: ChildProcess; stop(onStopped: () => void): void };

/** Starts the named agent in `workingDirectory`, or answers why it cannot, in words the client may show. */
export type LaunchAgent = (agentName: string, workingDirectory: string) => StartedAgent | string;

export type DeviceHost = {
  /** The device socket opened: say hello on it, and send through `send` until `detach`. */
  attach(send: (message: DeviceMessage) => void): void;
  detach(): void;
  /** Offers a new list from the next `open` on, and says hello again. Running agents keep running. */
  setAgents(agents: readonly AgentSlot[]): void;
  /** Agents started from here on work in `directory`, and the device says hello again. */
  setWorkingDirectory(directory: string): void;
  receive(message: RelayMessage): void;
  /** Stops every agent, as the device is shutting down. */
  stop(): void;
};

const defaultHeartbeatMs = 30_000;
const maxFailureLength = 500;

/**
 * Runs a device's agents: one process per connection the relay opens, each carried on its own agent socket.
 * A connection does not depend on the device socket, so agents keep running while it reconnects.
 */
export function createDeviceHost(input: {
  relayUrl: string;
  /** Proves on each agent socket that this device, and no other, answers the connection. */
  deviceKey: DeviceKey;
  hostname: string;
  platform: DevicePlatform;
  workingDirectory: string;
  agents: readonly AgentSlot[];
  launch: LaunchAgent;
  /** How often each agent socket is pinged. */
  heartbeatMs?: number;
}): DeviceHost {
  const running = new Map<string, () => void>();
  let offered = input.agents;
  let workingDirectory = input.workingDirectory;
  let send: ((message: DeviceMessage) => void) | undefined;

  const hello = (): void => {
    send?.({
      type: "hello",
      hostname: input.hostname.slice(0, 256),
      workingDirectory,
      agents: offered.map((agent) => ({ name: agent.name, agentType: agent.agentType })),
      platform: input.platform,
    });
  };
  // Without a device socket the relay hears nothing, and its open times out.
  const fail = (connectionId: string, message: string): void => send?.({ type: "open_failed", connectionId, message: clip(message) });

  return {
    attach(next) {
      send = next;
      hello();
    },
    detach() {
      send = undefined;
    },
    setAgents(agents) {
      offered = agents;
      hello();
    },
    setWorkingDirectory(directory) {
      workingDirectory = directory;
      hello();
    },
    receive({ connectionId, agentName }) {
      if (running.has(connectionId)) return;
      if (!offered.some((agent) => agent.name === agentName)) {
        fail(connectionId, "That agent is not configured.");
        return;
      }
      const started = input.launch(agentName, workingDirectory);
      if (typeof started === "string") {
        fail(connectionId, started);
        return;
      }
      let stop = (): void => started.stop(() => undefined);
      running.set(connectionId, () => stop());
      started.child.once("error", (error) => {
        if (started.child.pid !== undefined) return;
        running.delete(connectionId);
        fail(connectionId, error.message);
      });
      started.child.once("spawn", () => {
        const url = relayWebSocketUrl(input.relayUrl, agentSocketPath(connectionId));
        void dpopProof(input.deviceKey, "GET", url).then((proof) => {
          // Stopped while the proof was made.
          if (!running.has(connectionId)) return;
          const socket = new WebSocket(url, { headers: { dpop: proof }, handshakeTimeout: 10_000 });
          stop = carryAgent(started, socket, input.heartbeatMs ?? defaultHeartbeatMs);
          socket.once("close", () => running.delete(connectionId));
        });
      });
    },
    stop() {
      const live = [...running.values()];
      running.clear();
      for (const stop of live) stop();
    },
  };
}

/**
 * Carries ACP between an agent's standard streams and its agent socket: each frame is a line on its input, and
 * each line it writes is a frame. Standard error goes to this process's own. Each side waits for the other to
 * catch up, so a slow client slows the agent instead of filling memory. When the agent ends, the socket closes
 * normally; when the socket closes, the agent is stopped. Returns a function that stops both, as the device shuts down.
 */
export function carryAgent(agent: StartedAgent, socket: WebSocket, heartbeatMs: number): () => void {
  const { child } = agent;
  let exited = false;
  // Going away, not the agent ending: the relay tells the client the device is gone.
  let goingAway = false;
  const closeSocket = (): void => {
    if (goingAway) socket.close(1001, "device_stopping");
    else socket.close(1000, "agent_exited");
  };
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  child.once("close", () => {
    exited = true;
    if (socket.readyState === WebSocket.OPEN) closeSocket();
  });
  let stopping = false;
  const stopAgent = (): void => {
    if (exited || stopping) return;
    stopping = true;
    agent.stop(() => undefined);
  };

  const decoder = new StringDecoder("utf8");
  let pending = "";
  const sendFrame = (frame: string): void => {
    socket.send(frame, () => {
      if (socket.bufferedAmount <= frameBytes) child.stdout?.resume();
    });
    if (socket.bufferedAmount > frameBytes) child.stdout?.pause();
  };
  const takeStdout = (text: string): void => {
    const consumed = consumeAgentChunk(pending, text);
    pending = consumed.pending;
    // A line longer than a frame cannot cross the relay.
    if (consumed.overflow || consumed.frames.some((frame) => Buffer.byteLength(frame) > frameBytes)) {
      stopAgent();
      return;
    }
    for (const frame of consumed.frames) sendFrame(frame);
  };

  socket.once("open", () => {
    if (exited || goingAway) {
      closeSocket();
      return;
    }
    heartbeat(socket, heartbeatMs);
    // The agent's output is read only once it has somewhere to go; until then the agent waits on its pipe.
    child.stdout?.on("data", (chunk: Buffer) => takeStdout(decoder.write(chunk)));
    child.stdout?.on("end", () => takeStdout(decoder.end()));
  });
  socket.on("message", (data, isBinary) => {
    const stdin = child.stdin;
    if (isBinary || !stdin?.writable) return;
    const line = webSocketTextToAgentLine(data.toString());
    if (line === undefined) return;
    if (!stdin.write(line)) {
      socket.pause();
      stdin.once("drain", () => socket.resume());
    }
  });
  socket.on("error", () => undefined);
  socket.once("close", stopAgent);
  return () => {
    goingAway = true;
    if (socket.readyState === WebSocket.OPEN) closeSocket();
    stopAgent();
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
