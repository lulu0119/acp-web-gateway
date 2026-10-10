import type { AcpClientAdapter, AcpStreamFactory } from "@hafbit/react-acp";
import { SdkAcpClientAdapter } from "@hafbit/react-acp/core";

export type DirectoryAdapter = {
  /** Pass to `useAcpRuntime` as the connection adapter. */
  adapter: AcpClientAdapter;
  /**
   * Runs `createSession` so the new ACP session gets `directory` as its cwd.
   * react-acp sends the runtime's single workspace cwd on every session
   * request, so the adapter rewrites it while this call is in flight.
   */
  createSessionIn(directory: string, createSession: () => Promise<string>): Promise<string>;
};

/**
 * One ACP connection serves many working directories. Session cwd comes from
 * the directory chosen for that session, and loads reuse the cwd it was
 * created with.
 */
export function createDirectoryAdapter(createStream: AcpStreamFactory): DirectoryAdapter {
  const sdkAdapter = new SdkAcpClientAdapter(createStream);
  const directoryBySession = new Map<string, string>();
  let pendingDirectory: string | undefined;

  function withSessionDirectory<T extends { sessionId: string; cwd: string }>(request: T): T {
    return { ...request, cwd: directoryBySession.get(request.sessionId) ?? request.cwd };
  }

  const adapter: AcpClientAdapter = {
    async connect(options) {
      const connection = await sdkAdapter.connect(options);
      return {
        ...connection,
        async newSession(request) {
          if (pendingDirectory === undefined) {
            throw new Error("No working directory was chosen for the new session.");
          }
          const response = await connection.newSession({ ...request, cwd: pendingDirectory });
          directoryBySession.set(response.sessionId, pendingDirectory);
          return response;
        },
        loadSession: (request) => connection.loadSession(withSessionDirectory(request)),
        resumeSession: (request) => connection.resumeSession(withSessionDirectory(request)),
        async listSessions(request) {
          const response = await connection.listSessions(request);
          for (const session of response.sessions) {
            directoryBySession.set(session.sessionId, session.cwd);
          }
          return response;
        },
      };
    },
  };

  return {
    adapter,
    async createSessionIn(directory, createSession) {
      pendingDirectory = directory;
      try {
        return await createSession();
      } finally {
        pendingDirectory = undefined;
      }
    },
  };
}
