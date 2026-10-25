import { acpRegistryUrl, isRecord, registryIconUrl } from "@exterior/contract";
import { parseJson } from "@exterioragentprotocol/sdk";

const cacheMaxAgeMs = 60 * 60 * 1000;

export type AgentCatalog = {
  /** Icons by registry id. Empty when the registry cannot be read and nothing was cached. */
  icons(): Promise<ReadonlyMap<string, string>>;
};

export function createAgentCatalog(input?: { fetchText?: () => Promise<string>; now?: () => number }): AgentCatalog {
  let cached: { icons: ReadonlyMap<string, string>; at: number } | undefined;
  let pending: Promise<ReadonlyMap<string, string>> | undefined;
  return {
    icons() {
      const now = input?.now?.() ?? Date.now();
      if (cached && now - cached.at < cacheMaxAgeMs) return Promise.resolve(cached.icons);
      if (!pending) {
        const fetchText = input?.fetchText ?? fetchRegistryText;
        pending = fetchText()
          .then((text) => {
            const icons = parseAgentIcons(text);
            if (icons) cached = { icons, at: input?.now?.() ?? Date.now() };
            return cached?.icons ?? new Map();
          })
          .catch(() => cached?.icons ?? new Map())
          .finally(() => {
            pending = undefined;
          });
      }
      return pending;
    },
  };
}

/** The https icon each registry agent publishes, or undefined when the document cannot be read. */
export function parseAgentIcons(text: string): ReadonlyMap<string, string> | undefined {
  const value = parseJson(text);
  if (!isRecord(value) || !Array.isArray(value.agents)) return undefined;
  const icons = new Map<string, string>();
  for (const item of value.agents) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.length === 0) continue;
    const icon = registryIconUrl(item.icon);
    if (icon && !icons.has(item.id)) icons.set(item.id, icon);
  }
  return icons;
}

async function fetchRegistryText(): Promise<string> {
  const response = await fetch(acpRegistryUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`ACP registry responded ${response.status}.`);
  return response.text();
}
