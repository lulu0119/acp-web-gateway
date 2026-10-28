/**
 * Splits a pasted command line into arguments. Spaces separate them; '…' and "…" keep spaces together. A
 * backslash is an ordinary character, so a Windows path survives. Undefined while a quote is open.
 */
export function splitCommandLine(line: string): string[] | undefined {
  const words: string[] = [];
  let word: string | undefined;
  let quote: string | undefined;
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = undefined;
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      word ??= "";
    } else if (/\s/.test(char)) {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else {
      word = (word ?? "") + char;
    }
  }
  if (quote) return undefined;
  if (word !== undefined) words.push(word);
  return words;
}
