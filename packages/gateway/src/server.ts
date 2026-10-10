import { acpPath, statusPath, type GatewayStatus } from "@mukae/contract";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StringDecoder } from "node:string_decoder";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { admitConnection, statusForOrigin } from "./gate.js";
import { consumeAgentChunk, webSocketTextToAgentLine } from "./frames.js";

export type AgentProcess = {
  command: string;
  args: readonly string[];
  env: Record<string, string>;
};

export type GatewayServer = {
  port: number;
  finished: Promise<void>;
  stop: () => void;
  finishChoice: (agent: AgentProcess | undefined) => void;
};

export function startGatewayServer(input: {
  expectedNonce: string;
  expectedOrigin: string;
  port: number;
  idleTimeoutMs: number;
  initial: { status: "waiting"; agent: AgentProcess } | { status: "unconfigured" } | { status: "choosing" };
}): Promise<GatewayServer> {
  let phase: GatewayStatus = input.initial.status;
  let agentProcess: AgentProcess | undefined = input.initial.status === "waiting" ? input.initial.agent : undefined;
  const server = createServer((request, response) => {
    handleHttp(request, response);
  });
  const webSockets = new WebSocketServer({ noServer: true });
  let child: ChildProcess | undefined;
  let activeSocket: WebSocket | undefined;
  let settled = false;
  let resolveFinished = (): void => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = (): void => {
    if (settled) return;
    settled = true;
    clearTimeout(idleTimer);
    const socket = activeSocket;
    const agent = child;
    activeSocket = undefined;
    child = undefined;
    socket?.close();
    agent?.kill();
    server.closeAllConnections();
    server.close(() => resolveFinished());
  };

  function armIdle(): void {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(finish, input.idleTimeoutMs);
  }

  if (phase !== "choosing") armIdle();

  function finishChoice(agent: AgentProcess | undefined): void {
    if (settled || phase !== "choosing") return;
    if (agent) {
      phase = "waiting";
      agentProcess = agent;
    } else {
      phase = "cancelled";
    }
    armIdle();
  }

  function handleHttp(request: IncomingMessage, response: ServerResponse): void {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname !== statusPath) {
      response.writeHead(404).end();
      return;
    }
    const visible = statusForOrigin({
      expectedOrigin: input.expectedOrigin,
      origin: singleHeader(request.headers.origin),
      gatewayStatus: phase,
    });
    if (visible === "rejected") {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders(input.expectedOrigin)).end();
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    const body: { status: GatewayStatus } = { status: visible };
    response.writeHead(200, {
      ...corsHeaders(input.expectedOrigin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
  }

  server.on("upgrade", (request, socket, head) => {
    const selected = agentProcess;
    if (activeSocket || phase !== "waiting" || !selected) {
      rejectUpgrade(socket);
      return;
    }
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const admission = admitConnection({
      expectedNonce: input.expectedNonce,
      expectedOrigin: input.expectedOrigin,
      nonce: requestUrl.pathname === acpPath ? requestUrl.searchParams.get("nonce") : null,
      origin: singleHeader(request.headers.origin),
    });
    if (!admission.accept) {
      rejectUpgrade(socket);
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      activeSocket = webSocket;
      clearTimeout(idleTimer);
      attachAgent(webSocket, selected);
    });
  });

  function attachAgent(webSocket: WebSocket, selected: AgentProcess): void {
    const agent = spawn(selected.command, [...selected.args], {
      env: { ...process.env, ...selected.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child = agent;
    const closeBoth = (): void => finish();
    const decoder = new StringDecoder("utf8");
    let pending = "";
    const takeStdout = (text: string): void => {
      const consumed = consumeAgentChunk(pending, text);
      pending = consumed.pending;
      for (const frame of consumed.frames) {
        if (webSocket.readyState !== WebSocket.OPEN) return;
        try {
          webSocket.send(frame);
        } catch {
          closeBoth();
          return;
        }
      }
      if (consumed.overflow) closeBoth();
    };
    agent.stdout?.on("data", (chunk: Buffer) => {
      takeStdout(decoder.write(chunk));
    });
    agent.stdout?.on("end", () => {
      takeStdout(decoder.end());
    });
    agent.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    webSocket.on("message", (data, isBinary) => {
      if (isBinary || !agent.stdin?.writable) return;
      try {
        agent.stdin.write(webSocketTextToAgentLine(data.toString()));
      } catch {
        closeBoth();
      }
    });
    webSocket.on("close", closeBoth);
    webSocket.on("error", closeBoth);
    agent.on("exit", closeBoth);
    agent.on("error", closeBoth);
    agent.stdin?.on("error", closeBoth);
    agent.stdout?.on("error", closeBoth);
    agent.stderr?.on("error", closeBoth);
  }

  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      clearTimeout(idleTimer);
      reject(error);
    });
    server.listen(input.port, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        clearTimeout(idleTimer);
        reject(new Error("Gateway did not bind a TCP port."));
        return;
      }
      resolve({ port: address.port, finished, stop: finish, finishChoice });
    });
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

function singleHeader(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function rejectUpgrade(socket: Duplex): void {
  socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  socket.destroy();
}
