import * as oauth from "oauth4webapi";

export type Tokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export class RefreshTokenRejectedError extends Error {
  constructor() {
    super("Sign in again.");
    this.name = "RefreshTokenRejectedError";
  }
}

export async function refreshAccessToken(input: {
  relayUrl: string;
  clientId: string;
  refreshToken: string;
  clientSecret?: string;
  signal?: AbortSignal;
}): Promise<Tokens> {
  const server = await discover(input.relayUrl, input.signal);
  const client = publicClient(input.clientId);
  const auth = input.clientSecret ? oauth.ClientSecretPost(input.clientSecret) : oauth.None();
  const response = await oauth.refreshTokenGrantRequest(server, client, auth, input.refreshToken, {
    ...requestOptions(input.relayUrl, originOf(input.relayUrl)),
    signal: input.signal,
  });
  const tokens = await oauth.processRefreshTokenResponse(server, client, response).catch((error: unknown) => {
    if (error instanceof oauth.ResponseBodyError && ["invalid_grant", "invalid_client", "unauthorized_client", "access_denied"].includes(error.error)) {
      throw new RefreshTokenRejectedError();
    }
    throw new Error(oauthMessage(error, "Sign in again."));
  });
  return toTokens(tokens, input.refreshToken);
}

/** Revokes a refresh token, so it no longer signs anything in. */
export async function revokeRefreshToken(input: { relayUrl: string; clientId: string; refreshToken: string; signal?: AbortSignal }): Promise<void> {
  const server = await discover(input.relayUrl, input.signal);
  const response = await oauth.revocationRequest(server, publicClient(input.clientId), oauth.None(), input.refreshToken, {
    ...httpOptions(input.relayUrl),
    additionalParameters: { token_type_hint: "refresh_token" },
    signal: input.signal,
  });
  await oauth.processRevocationResponse(response).catch((error: unknown) => {
    throw new Error(oauthMessage(error, "Exterior did not revoke the sign-in."));
  });
}

export async function discover(relayUrl: string, signal?: AbortSignal): Promise<oauth.AuthorizationServer> {
  const issuer = new URL("/api/auth", originOf(relayUrl));
  let response: Response;
  try {
    response = await oauth.discoveryRequest(issuer, { ...httpOptions(relayUrl), signal });
  } catch {
    throw new Error(`Exterior did not answer at ${originOf(relayUrl)}.`);
  }
  const server = await oauth.processDiscoveryResponse(issuer, response).catch(() => {
    throw new Error(`Exterior did not answer at ${originOf(relayUrl)}.`);
  });
  if (!server.device_authorization_endpoint) {
    return { ...server, device_authorization_endpoint: new URL("/device/code", issuer).href };
  }
  return server;
}

export function publicClient(clientId: string): oauth.Client {
  return { client_id: clientId, token_endpoint_auth_method: "none" };
}

export function requestOptions(relayUrl: string, resource: string): oauth.TokenEndpointRequestOptions {
  return { ...httpOptions(relayUrl), additionalParameters: { resource } };
}

export function httpOptions(relayUrl: string): { [oauth.allowInsecureRequests]?: true } {
  return new URL(originOf(relayUrl)).protocol === "http:" ? { [oauth.allowInsecureRequests]: true } : {};
}

export function toTokens(tokens: oauth.TokenEndpointResponse, previousRefresh?: string): Tokens {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}

export function originOf(relayUrl: string): string {
  return new URL(relayUrl).origin;
}

export function oauthMessage(error: unknown, fallback: string): string {
  if (error instanceof oauth.ResponseBodyError && error.error_description) return error.error_description;
  if (error instanceof oauth.AuthorizationResponseError && error.error_description) return error.error_description;
  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
