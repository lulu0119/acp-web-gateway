/** Wraps a value in single quotes so the shell reads it as one word, even with spaces or quotes. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
