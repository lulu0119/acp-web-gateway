import { clientScope, connectionsPath, devicesPath, errorCodes, isDevice, type Device, type ErrorCode } from "../index.js";
import * as oauth from "oauth4webapi";
import { discover, isRecord, oauthMessage, originOf, publicClient, refreshAccessToken, RefreshTokenRejectedError, requestOptions, toTokens, type Tokens } from "../oauth.js";

const refreshWindowMs = 60_000;
const signInScope = `${clientScope} offline_access`;

export async function createAuthorizationRequest(input: {
  relayUrl: string;
  clientId: string;
  redirectUri: string;
}): Promise<{ url: string; codeVerifier: string; state: string }> {
  const server = await discover(input.relayUrl);
  if (!server.authorization_endpoint) throw new Error("The relay did not publish a sign-in address.");
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const url = new URL(server.authorization_endpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", signInScope);
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("resource", originOf(input.relayUrl));
  return { url: url.href, codeVerifier, state };
}

export async function exchangeAuthorizationCode(input: {
  relayUrl: string;
  clientId: string;
  redirectUri: string;
  callbackUrl: string;
  codeVerifier: string;
  state: string;
}): Promise<Tokens> {
  const server = await discover(input.relayUrl);
  const client = publicClient(input.clientId);
  const callback = new URL(input.callbackUrl);
  let params: URLSearchParams;
  try {
    params = oauth.validateAuthResponse(server, client, callback, input.state);
  } catch (error) {
    throw new Error(oauthMessage(error, "Sign in again."));
  }
  const response = await oauth.authorizationCodeGrantRequest(
    server,
    client,
    oauth.None(),
    params,
    input.redirectUri,
    input.codeVerifier,
    requestOptions(input.relayUrl, originOf(input.relayUrl)),
  );
  const tokens = await oauth.processAuthorizationCodeResponse(server, client, response).catch((error: unknown) => {
    throw new Error(oauthMessage(error, "Sign in again."));
  });
  return toTokens(tokens);
}

/** An error response from the relay. Decide by `code`; `message` is for people. */
export class RelayError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, message: string) {
    super(message);
    this.name = "RelayError";
  }
}

/** A connection the device started: dial `url` once, right away, as the agent's ACP address. */
export type OpenedAgent = { url: string };

export async function listDevices(relayUrl: string, accessToken: string, signal?: AbortSignal): Promise<Device[]> {
  const response = await fetch(new URL(devicesPath, originOf(relayUrl)), {
    headers: { authorization: `Bearer ${accessToken}` },
    credentials: "omit",
    signal,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw relayError(response.status, body, "The relay did not list devices.");
  if (!isRecord(body) || !Array.isArray(body.devices)) throw new RelayError("server_error", response.status, "The relay did not list devices.");
  return body.devices.filter(isDevice);
}

export async function openConnection(
  relayUrl: string,
  accessToken: string,
  input: { deviceId: string; agentName: string },
  signal?: AbortSignal,
): Promise<OpenedAgent> {
  const response = await fetch(new URL(connectionsPath, originOf(relayUrl)), {
    method: "POST",
    credentials: "omit",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw relayError(response.status, body, "The relay did not open the agent.");
  if (!isRecord(body) || typeof body.url !== "string") throw new RelayError("server_error", response.status, "The relay did not open the agent.");
  return { url: body.url };
}

export function relayError(status: number, body: unknown, fallback: string): RelayError {
  const named = isRecord(body) && typeof body.code === "string" ? errorCodes.find((code) => code === body.code) : undefined;
  const message = isRecord(body) && typeof body.message === "string" ? body.message : fallback;
  return new RelayError(named ?? (status === 401 ? "unauthorized" : "server_error"), status, message);
}

export const browserCallbackPath = "/oauth/callback";

export type BrowserStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const verifierKey = "exterior.codeVerifier";
const stateKey = "exterior.state";
const accessKey = "exterior.accessToken";
const refreshKey = "exterior.refreshToken";
const expiresKey = "exterior.expiresAt";

/**
 * Starts a sign-in and returns the relay address to send the person to. `clientId` is the https address of the
 * app's Client ID Metadata Document, or a client an account registered on the relay.
 */
export async function beginBrowserSignIn(input: { relayUrl: string; redirectUri: string; store: BrowserStore; clientId: string }): Promise<string> {
  const request = await createAuthorizationRequest({ relayUrl: input.relayUrl, clientId: input.clientId, redirectUri: input.redirectUri });
  input.store.setItem(verifierKey, request.codeVerifier);
  input.store.setItem(stateKey, request.state);
  return request.url;
}

export async function finishBrowserSignIn(input: {
  relayUrl: string;
  redirectUri: string;
  callbackUrl: string;
  store: BrowserStore;
  clientId: string;
}): Promise<Tokens> {
  const codeVerifier = input.store.getItem(verifierKey);
  const state = input.store.getItem(stateKey);
  if (!codeVerifier || !state) throw new Error("Sign in again.");
  // A code redeems once, but a framework may mount the callback twice:
  // racing callers for the same code share one redemption.
  const key = `${input.redirectUri}\n${new URL(input.callbackUrl).searchParams.get("code") ?? ""}`;
  const racing = pendingCallbackExchanges.get(key);
  if (racing) return racing;
  const run = exchangeAuthorizationCode({
    relayUrl: input.relayUrl,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    callbackUrl: input.callbackUrl,
    codeVerifier,
    state,
  })
    .then((tokens) => {
      writeBrowserTokens(input.store, tokens);
      input.store.removeItem(verifierKey);
      input.store.removeItem(stateKey);
      return tokens;
    })
    .finally(() => {
      if (pendingCallbackExchanges.get(key) === run) pendingCallbackExchanges.delete(key);
    });
  pendingCallbackExchanges.set(key, run);
  return run;
}

const pendingCallbackExchanges = new Map<string, Promise<Tokens>>();

/**
 * A live access token, refreshed within the last minute of its life, or undefined once the sign-in is gone. A relay
 * that does not answer the refresh rejects, and the sign-in is kept.
 */
export async function storedAccessToken(input: { relayUrl: string; store: BrowserStore; clientId: string }): Promise<string | undefined> {
  const accessToken = input.store.getItem(accessKey);
  const expiresAt = Number(input.store.getItem(expiresKey));
  if (accessToken && Number.isFinite(expiresAt) && expiresAt - Date.now() > refreshWindowMs) return accessToken;
  const refreshToken = input.store.getItem(refreshKey);
  if (!refreshToken) return undefined;
  // A relay may rotate the refresh token on each use, so callers racing to refresh share one.
  let refreshing = pendingRefreshes.get(refreshToken);
  if (!refreshing) {
    refreshing = refreshAccessToken({ relayUrl: input.relayUrl, clientId: input.clientId, refreshToken })
      .then((tokens) => {
        writeBrowserTokens(input.store, tokens);
        return tokens;
      })
      .finally(() => pendingRefreshes.delete(refreshToken));
    pendingRefreshes.set(refreshToken, refreshing);
  }
  try {
    return (await refreshing).accessToken;
  } catch (error) {
    if (!(error instanceof RefreshTokenRejectedError)) throw error;
    clearBrowserSignIn(input.store);
    return undefined;
  }
}

const pendingRefreshes = new Map<string, Promise<Tokens>>();

function writeBrowserTokens(store: BrowserStore, tokens: Tokens): void {
  store.setItem(accessKey, tokens.accessToken);
  store.setItem(expiresKey, String(tokens.expiresAt));
  if (tokens.refreshToken) store.setItem(refreshKey, tokens.refreshToken);
}

export function clearBrowserSignIn(store: BrowserStore): void {
  store.removeItem(accessKey);
  store.removeItem(refreshKey);
  store.removeItem(expiresKey);
}
