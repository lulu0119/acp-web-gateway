export const maxPendingAgentChars = 1_048_576;

export function webSocketTextToAgentLine(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
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
