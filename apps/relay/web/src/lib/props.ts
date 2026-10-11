export function readProps<T>(fallback: T): T {
  const element = document.getElementById("props");
  if (!element?.textContent) return fallback;
  try {
    return { ...fallback, ...JSON.parse(element.textContent) };
  } catch {
    return fallback;
  }
}
