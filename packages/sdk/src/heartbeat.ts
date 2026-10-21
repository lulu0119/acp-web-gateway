import type { WebSocket } from "ws";

/**
 * Pings `socket` every `everyMs` and terminates it when the previous ping is still unanswered, after telling `onSilent`.
 * A socket whose far end vanished without closing stays open until then. Returns a function that stops pinging.
 */
export function heartbeat(socket: WebSocket, everyMs: number, onSilent?: () => void): () => void {
  let answered = true;
  socket.on("pong", () => (answered = true));
  const timer = setInterval(() => {
    if (!answered) {
      onSilent?.();
      socket.terminate();
      return;
    }
    answered = false;
    socket.ping();
  }, everyMs);
  socket.once("close", () => clearInterval(timer));
  return () => clearInterval(timer);
}
