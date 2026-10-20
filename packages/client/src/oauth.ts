import {
  devicePlatforms,
  devicesPath,
  exampleCallbackPath,
  devicesScope,
  isRecord,
  publicClientsPath,
  connectionsPath,
  type Device,
  type DeviceRegistration,
  type PublicClients,
} from "@exterior/contract";
import * as oauth from "oauth4webapi";

export type ExteriorTokens = {
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

/**
 * The relay did not register the device. 401: the access token expired. 403: the refresh token is not a live
 * sign-in of this account, such as one revoked by removing the device. 409: another account holds the device id.
 */
export class DeviceRegistrationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "DeviceRegistrationError";
  }
}

export type DeviceAuthorization = {
  relayUrl: string;
  clientId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** The verification address with the code filled in, when Exterior offers one. */
  verificationUriComplete?: string;
  expiresAt: number;
  intervalSeconds: number;
};

const refreshWindowMs = 60_000;

export async function fetchPublicClients(relayUrl: string, signal?: AbortSignal): Promise<PublicClients> {
  const response = await fetch(new URL(publicClientsPath, originOf(relayUrl)), { signal }).catch((error: unknown) => {
    if (signal?.aborted) throw error;
    throw new Error(`Exterior did not answer at ${originOf(relayUrl)}.`, { cause: error });
  });
  if (!response.ok) throw new Error(`Exterior did not answer at ${originOf(relayUrl)}.`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!isRecord(body) || typeof body.daemonClientId !== "string") {
    throw new Error("Exterior did not list its clients.");
  }
  return { daemonClientId: body.daemonClientId };
}

export async function createAuthorizationRequest(input: {
  relayUrl: string;
  clientId: string;
  redirectUri: string;
}): Promise<{ url: string; codeVerifier: string; state: string }> {
  const server = await discover(input.relayUrl);
  if (!server.authorization_endpoint) throw new Error("Exterior did not publish a sign-in address.");
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const url = new URL(server.authorization_endpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", devicesScope);
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
  clientSecret?: string;
}): Promise<ExteriorTokens> {
  const server = await discover(input.relayUrl);
  const client = publicClient(input.clientId);
  const callback = new URL(input.callbackUrl);
  let params: URLSearchParams;
  try {
    params = oauth.validateAuthResponse(server, client, callback, input.state);
  } catch (error) {
    throw new Error(oauthMessage(error, "Sign in again."));
  }
  const auth = input.clientSecret ? oauth.ClientSecretPost(input.clientSecret) : oauth.None();
  const response = await oauth.authorizationCodeGrantRequest(
    server,
    client,
    auth,
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

export async function refreshExteriorAccessToken(input: {
  relayUrl: string;
  clientId: string;
  refreshToken: string;
  clientSecret?: string;
  signal?: AbortSignal;
}): Promise<ExteriorTokens> {
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

export async function beginDeviceAuthorization(input: { relayUrl: string; clientId: string }): Promise<DeviceAuthorization> {
  const server = await discover(input.relayUrl);
  const client = publicClient(input.clientId);
  const response = await oauth.deviceAuthorizationRequest(
    server,
    client,
    oauth.None(),
    new URLSearchParams({ scope: devicesScope, resource: originOf(input.relayUrl) }),
    httpOptions(input.relayUrl),
  );
  const device = await oauth.processDeviceAuthorizationResponse(server, client, response).catch((error: unknown) => {
    throw new Error(oauthMessage(error, "Exterior did not start device sign-in."));
  });
  return {
    relayUrl: originOf(input.relayUrl),
    clientId: input.clientId,
    deviceCode: device.device_code,
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    verificationUriComplete: device.verification_uri_complete,
    expiresAt: Date.now() + device.expires_in * 1000,
    intervalSeconds: device.interval ?? 5,
  };
}

export async function pollDeviceAuthorization(pending: DeviceAuthorization, signal?: AbortSignal): Promise<ExteriorTokens> {
  const server = await discover(pending.relayUrl);
  const client = publicClient(pending.clientId);
  let intervalMs = pending.intervalSeconds * 1000;
  while (Date.now() < pending.expiresAt) {
    await delay(intervalMs, signal);
    try {
      const response = await oauth.deviceCodeGrantRequest(
        server,
        client,
        oauth.None(),
        pending.deviceCode,
        requestOptions(pending.relayUrl, originOf(pending.relayUrl)),
      );
      const tokens = await oauth.processDeviceCodeResponse(server, client, response);
      const stored = toTokens(tokens);
      if (!stored.refreshToken) throw new Error("Exterior did not return a refresh token.");
      return stored;
    } catch (error) {
      if (!(error instanceof oauth.ResponseBodyError)) throw error;
      if (error.error === "authorization_pending") continue;
      if (error.error === "slow_down") {
        intervalMs += 5_000;
        continue;
      }
      if (error.error === "access_denied") throw new Error("The device was not approved.");
      if (error.error === "expired_token") throw new Error("The sign-in code expired.");
      throw new Error(error.error_description ?? "Sign-in failed.");
    }
  }
  throw new Error("The sign-in code expired.");
}

/** Tells the relay which device a daemon sign-in belongs to. A daemon connects only as a registered device. */
export async function registerDevice(relayUrl: string, accessToken: string, device: DeviceRegistration, signal?: AbortSignal): Promise<void> {
  const response = await fetch(new URL(devicesPath, originOf(relayUrl)), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(device),
    signal,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message = isRecord(body) && typeof body.message === "string" ? body.message : `Exterior did not record this device (HTTP ${response.status}).`;
    throw new DeviceRegistrationError(response.status, message);
  }
}

export async function listDevices(relayUrl: string, accessToken: string, signal?: AbortSignal): Promise<Device[]> {
  const response = await fetch(new URL(devicesPath, originOf(relayUrl)), {
    headers: { authorization: `Bearer ${accessToken}` },
    credentials: "omit",
    signal,
  });
  if (response.status === 401) throw new Error("Sign in again.");
  if (!response.ok) throw new Error("Exterior did not list devices.");
  const body: unknown = await response.json().catch(() => undefined);
  if (!isRecord(body) || !Array.isArray(body.devices)) throw new Error("Exterior did not list devices.");
  return body.devices.filter(isDevice);
}

export async function openConnection(
  relayUrl: string,
  accessToken: string,
  input: { deviceId: string; agentName: string },
  signal?: AbortSignal,
): Promise<{ url: string; agentType: string; agentName: string }> {
  const response = await fetch(new URL(connectionsPath, originOf(relayUrl)), {
    method: "POST",
    credentials: "omit",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : "Exterior did not open the agent.";
    throw new Error(message);
  }
  if (!isRecord(body) || typeof body.url !== "string" || typeof body.agentType !== "string" || typeof body.agentName !== "string") {
    throw new Error("Exterior did not open the agent.");
  }
  return { url: body.url, agentType: body.agentType, agentName: body.agentName };
}

export const browserCallbackPath = exampleCallbackPath;

export type BrowserStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const verifierKey = "exterior.codeVerifier";
const stateKey = "exterior.state";
const signInClientKey = "exterior.signInClientId";
const signInRegistrationKey = "exterior.signInRegistration";
const accessKey = "exterior.accessToken";
const refreshKey = "exterior.refreshToken";
const expiresKey = "exterior.expiresAt";

export async function fetchExteriorUser(input: { relayUrl: string; accessToken: string }): Promise<{ sub: string }> {
  const response = await fetch(new URL("/api/auth/oauth2/userinfo", originOf(input.relayUrl)), {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok) throw new Error("Exterior did not identify the account.");
  const body: unknown = await response.json().catch(() => undefined);
  if (!isRecord(body) || typeof body.sub !== "string") throw new Error("Exterior did not identify the account.");
  return { sub: body.sub };
}

/**
 * Registers a web app that has no client id of its own (RFC 7591), as a public client that returns
 * to `redirectUri`. The relay shows `clientName` and the logo at `logoUri` as the app's own claim.
 */
export async function registerBrowserClient(input: {
  relayUrl: string;
  redirectUri: string;
  clientName?: string;
  logoUri?: string;
}): Promise<string> {
  const server = await discover(input.relayUrl);
  if (!server.registration_endpoint) throw new Error("Exterior does not let apps register themselves.");
  const redirect = new URL(input.redirectUri);
  const loopback = redirect.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  const response = await oauth.dynamicClientRegistrationRequest(
    server,
    {
      client_name: input.clientName ?? `Web app at ${redirect.origin}`,
      logo_uri: input.logoUri,
      redirect_uris: [input.redirectUri],
      // A redirect to this computer is what RFC 8252 calls a native app's.
      application_type: loopback ? "native" : "web",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: devicesScope,
    },
    httpOptions(input.relayUrl),
  );
  try {
    return (await oauth.processDynamicClientRegistrationResponse(response)).client_id;
  } catch (error) {
    throw new Error(oauthMessage(error, "Exterior did not register this app."), { cause: error });
  }
}

function cachedClientId(store: BrowserStore, relayUrl: string): string | undefined {
  return store.getItem(clientIdKey(originOf(relayUrl))) ?? undefined;
}

function cacheClientId(store: BrowserStore, relayUrl: string, clientId: string): void {
  store.setItem(clientIdKey(originOf(relayUrl)), clientId);
}

function clientIdKey(origin: string): string {
  return `exterior.clientId:${origin}`;
}

/** Where an app's own registration is kept: one per relay and redirect address, for every sign-in from this browser. */
function registrationKey(relayUrl: string, redirectUri: string): string {
  return `exterior.registration:${originOf(relayUrl)}:${redirectUri}`;
}

/**
 * Starts a sign-in and returns the relay address to send the person to.
 *
 * An app passes `clientId` when it has one: a client an account registered, or the https address of
 * its Client ID Metadata Document. Without one, the app registers itself once per browser, and the
 * registration is kept in `registrations` after the first sign-in finishes.
 */
export async function beginBrowserSignIn(input: {
  relayUrl: string;
  redirectUri: string;
  store: BrowserStore;
  /** Kept across sign-ins and tabs; `localStorage` in a browser. */
  registrations?: BrowserStore;
  clientId?: string;
  clientName?: string;
  logoUri?: string;
}): Promise<string> {
  const registered = input.clientId ? undefined : input.registrations?.getItem(registrationKey(input.relayUrl, input.redirectUri)) ?? undefined;
  const clientId = input.clientId ?? registered ?? (await registerBrowserClient(input));
  const request = await createAuthorizationRequest({ relayUrl: input.relayUrl, clientId, redirectUri: input.redirectUri });
  input.store.setItem(verifierKey, request.codeVerifier);
  input.store.setItem(stateKey, request.state);
  input.store.setItem(signInClientKey, clientId);
  if (input.clientId) input.store.removeItem(signInRegistrationKey);
  else input.store.setItem(signInRegistrationKey, clientId);
  return request.url;
}

export async function finishBrowserSignIn(input: {
  relayUrl: string;
  redirectUri: string;
  callbackUrl: string;
  store: BrowserStore;
  registrations?: BrowserStore;
  clientId?: string;
  clientSecret?: string;
}): Promise<ExteriorTokens> {
  const codeVerifier = input.store.getItem(verifierKey);
  const state = input.store.getItem(stateKey);
  const clientId = input.clientId ?? input.store.getItem(signInClientKey) ?? cachedClientId(input.store, input.relayUrl);
  if (!codeVerifier || !state || !clientId) throw new Error("Sign in again.");
  // A code redeems once, but a framework may mount the callback twice:
  // racing callers for the same code share one redemption.
  const key = `${input.redirectUri}\n${callbackCode(input.callbackUrl) ?? ""}`;
  const racing = pendingCallbackExchanges.get(key);
  if (racing) return racing;
  const run = exchangeAuthorizationCode({
    relayUrl: input.relayUrl,
    clientId,
    redirectUri: input.redirectUri,
    callbackUrl: input.callbackUrl,
    codeVerifier,
    state,
    clientSecret: input.clientSecret,
  })
    .then((tokens) => {
      writeBrowserTokens(input.store, tokens);
      cacheClientId(input.store, input.relayUrl, clientId);
      // Kept only once a sign-in works, so a registration nobody approved is not reused.
      const registration = input.store.getItem(signInRegistrationKey);
      if (registration) input.registrations?.setItem(registrationKey(input.relayUrl, input.redirectUri), registration);
      input.store.removeItem(verifierKey);
      input.store.removeItem(stateKey);
      input.store.removeItem(signInClientKey);
      input.store.removeItem(signInRegistrationKey);
      return tokens;
    })
    .finally(() => {
      if (pendingCallbackExchanges.get(key) === run) pendingCallbackExchanges.delete(key);
    });
  pendingCallbackExchanges.set(key, run);
  return run;
}

const pendingCallbackExchanges = new Map<string, Promise<ExteriorTokens>>();

function callbackCode(callbackUrl: string): string | undefined {
  try {
    return new URL(callbackUrl).searchParams.get("code") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function storedAccessToken(input: { relayUrl: string; store: BrowserStore; clientId?: string; clientSecret?: string }): Promise<string | undefined> {
  const clientId = input.clientId ?? cachedClientId(input.store, input.relayUrl);
  if (!clientId) return undefined;
  const accessToken = input.store.getItem(accessKey);
  const expiresAt = Number(input.store.getItem(expiresKey));
  if (accessToken && Number.isFinite(expiresAt) && expiresAt - Date.now() > refreshWindowMs) return accessToken;
  const refreshToken = input.store.getItem(refreshKey);
  if (!refreshToken) return undefined;
  try {
    const tokens = await refreshExteriorAccessToken({ relayUrl: input.relayUrl, clientId, refreshToken, clientSecret: input.clientSecret });
    writeBrowserTokens(input.store, tokens);
    return tokens.accessToken;
  } catch {
    clearBrowserTokens(input.store);
    return undefined;
  }
}

export function clearBrowserSignIn(store: BrowserStore): void {
  clearBrowserTokens(store);
}

async function discover(relayUrl: string, signal?: AbortSignal): Promise<oauth.AuthorizationServer> {
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

function publicClient(clientId: string): oauth.Client {
  return { client_id: clientId, token_endpoint_auth_method: "none" };
}

function requestOptions(relayUrl: string, resource: string): oauth.TokenEndpointRequestOptions {
  return { ...httpOptions(relayUrl), additionalParameters: { resource } };
}

function httpOptions(relayUrl: string): { [oauth.allowInsecureRequests]?: true } {
  return new URL(originOf(relayUrl)).protocol === "http:" ? { [oauth.allowInsecureRequests]: true } : {};
}

function toTokens(tokens: oauth.TokenEndpointResponse, previousRefresh?: string): ExteriorTokens {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}

function writeBrowserTokens(store: BrowserStore, tokens: ExteriorTokens): void {
  store.setItem(accessKey, tokens.accessToken);
  store.setItem(expiresKey, String(tokens.expiresAt));
  if (tokens.refreshToken) store.setItem(refreshKey, tokens.refreshToken);
}

function clearBrowserTokens(store: BrowserStore): void {
  store.removeItem(accessKey);
  store.removeItem(refreshKey);
  store.removeItem(expiresKey);
}

function originOf(relayUrl: string): string {
  return new URL(relayUrl).origin;
}

function oauthMessage(error: unknown, fallback: string): string {
  if (error instanceof oauth.ResponseBodyError && error.error_description) return error.error_description;
  if (error instanceof oauth.AuthorizationResponseError && error.error_description) return error.error_description;
  return fallback;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Sign-in cancelled."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Sign-in cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isDevice(value: unknown): value is Device {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.hostname !== "string" || !Array.isArray(value.agents)) return false;
  if (typeof value.workingDirectory !== "string") return false;
  if (!(devicePlatforms as readonly unknown[]).includes(value.platform)) return false;
  return value.agents.every((agent) => isRecord(agent) && typeof agent.name === "string" && typeof agent.agentType === "string");
}
