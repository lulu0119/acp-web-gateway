import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import {
  AcpThreadController,
  projectAcpThreadMessages,
  type AcpClientAdapter,
  type AcpClientConnection,
  type AcpClientHandlers,
} from "@hafbit/react-acp/core";
import { expect, test } from "vitest";

const sessionId = "conversation-1";

function agent() {
  let handlers: AcpClientHandlers | undefined;
  const loads: string[] = [];
  const resumes: string[] = [];
  let releaseLoad: () => void = () => {};
  let loadStarted: () => void = () => {};
  const loadEntered = new Promise<void>((resolve) => {
    loadStarted = resolve;
  });
  const connection: AcpClientConnection = {
    signal: new AbortController().signal,
    async initialize() {
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { resume: {}, close: {} },
        },
      };
    },
    async authenticate() {},
    async logout() {},
    async newSession() {
      return { sessionId: "new" };
    },
    async loadSession(request) {
      loads.push(request.sessionId);
      loadStarted();
      return new Promise((resolve) => {
        releaseLoad = () => resolve({});
      });
    },
    async listSessions() {
      return { sessions: [] };
    },
    async deleteSession() {},
    async resumeSession(request) {
      resumes.push(request.sessionId);
      return {};
    },
    async closeSession() {},
    async setSessionMode() {},
    async setSessionConfigOption() {
      return { configOptions: [] };
    },
    async prompt() {
      return { stopReason: "end_turn" };
    },
    async cancel() {},
    close() {},
  };
  const adapter: AcpClientAdapter = {
    async connect(options) {
      handlers = options.handlers;
      return connection;
    },
  };
  const controller = new AcpThreadController({
    workspace: { cwd: "/tmp/exterior-workspace" },
    connection: { type: "adapter", adapter },
  });
  return {
    controller,
    loads,
    resumes,
    entered: loadEntered,
    release: () => releaseLoad(),
    update: (text: string, messageId?: string) => {
      if (!handlers) throw new Error("ACP connection is not open");
      return handlers.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
          ...(messageId ? { messageId } : {}),
        },
      });
    },
  };
}

test("a conversation is selected while its history is still loading", async () => {
  const acp = agent();
  await acp.controller.connect();
  const selecting = acp.controller.selectSession(sessionId);
  await acp.entered;
  expect(acp.controller.getState().activeSessionId).toBe(sessionId);
  expect(acp.loads).toEqual([sessionId]);
  await acp.update("hello");
  expect(acp.controller.getState().sessions[sessionId]?.messages[0]?.status).toEqual({ type: "running" });
  acp.release();
  await selecting;
  expect(acp.controller.getState().sessions[sessionId]?.messages[0]?.status).toEqual({
    type: "complete",
    stopReason: "end_turn",
  });
  expect(acp.controller.getState().sessions[sessionId]?.runState).toBe("idle");

  await acp.controller.closeSession(sessionId);
  await acp.controller.selectSession(sessionId);
  expect(acp.resumes).toEqual([sessionId]);
  expect(acp.loads).toEqual([sessionId]);
  expect(acp.controller.getState().sessions[sessionId]?.messages[0]?.status).toEqual({
    type: "complete",
    stopReason: "end_turn",
  });
  await acp.update("tail", "later");
  const projected = projectAcpThreadMessages(acp.controller.getState(), sessionId);
  expect(projected.filter((message) => message.role === "assistant").every((message) => message.status?.type === "complete")).toBe(true);
  expect(acp.controller.getState().activeSessionId).toBe(sessionId);
  acp.controller.disconnect();
});
