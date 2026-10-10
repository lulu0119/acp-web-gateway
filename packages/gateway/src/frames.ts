export function webSocketTextToAgentLine(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function consumeAgentChunk(
  pending: string,
  chunk: string,
): { pending: string; frames: string[] } {
  const parts = (pending + chunk).split("\n");
  const remainder = parts.pop() ?? "";
  const frames = parts
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0);
  return { pending: remainder, frames };
}
