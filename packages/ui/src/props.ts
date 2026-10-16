/** Reads the JSON the server embedded in `#props`. */
export function readProps<T>(fallback: T): T {
  const element = document.getElementById("props");
  if (!element?.textContent) return fallback;
  try {
    return JSON.parse(element.textContent) as T;
  } catch {
    return fallback;
  }
}
