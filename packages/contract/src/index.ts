export const defaultRelayUrl = "http://127.0.0.1:8787";

export const clientRegistryPath = "/api/clients/register";
export const grantsPath = "/api/grants";

/**
 * The OAuth client the Exterior daemon signs in with on any relay: a Client ID Metadata Document published with
 * the project, at its own `client_id`. Each device is a key bound to its tokens, not a client of its own.
 */
export const exteriorDeviceClient = {
  client_id: "https://lulu0119.github.io/exterior/device-client.json",
  client_name: "Exterior",
  client_uri: "https://lulu0119.github.io/exterior/",
  grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  response_types: [],
  token_endpoint_auth_method: "none",
  dpop_bound_access_tokens: true,
} as const;

/**
 * The OAuth client Example signs in with: a Client ID Metadata Document published with Example itself. Its loopback
 * redirect, on any port, lets a development copy of Example sign in under the same client.
 */
export const exampleClient = {
  client_id: "https://lulu0119.github.io/exterior/oauth-client.json",
  client_name: "Example",
  client_uri: "https://lulu0119.github.io/exterior/",
  logo_uri: "https://lulu0119.github.io/exterior/oauth-client-logo.png",
  redirect_uris: ["https://lulu0119.github.io/exterior/oauth/callback", "http://localhost:5173/oauth/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
} as const;

/** The ACP registry the daemon launches from and the relay reads agent icons from. */
export const acpRegistryUrl = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The registry icon address to show for an agent, or undefined when it is not a usable https address. */
export function registryIconUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function isEnvName(value: string): boolean {
  return envNamePattern.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
