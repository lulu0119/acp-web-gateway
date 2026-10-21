export const maxPendingAgentChars = 1_048_576;

/** The line to write for a frame, or undefined for a frame with a raw newline inside, which the device refuses. */
export function webSocketTextToAgentLine(text: string): string | undefined {
  const frame = text.endsWith("\n") ? text.slice(0, -1) : text;
  return frame.includes("\n") ? undefined : `${frame}\n`;
}

export function consumeAgentChunk(
  pending: string,
  chunk: string,
): { pending: string; frames: string[]; overflow: boolean } {
  const parts = (pending + chunk).split("\n");
  const remainder = parts.pop() ?? "";
  const frames = parts
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0);
  if (remainder.length > maxPendingAgentChars) return { pending: "", frames, overflow: true };
  return { pending: remainder, frames, overflow: false };
}
