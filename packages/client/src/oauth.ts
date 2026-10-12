import {
  authorizeRequestPath,
  exampleCallbackPath,
  isRecord,
  machinesPath,
  machinesScope,
  publicClientsPath,
  sessionsPath,
  type Machine,
  type PublicClients,
} from "@mukae/contract";
import * as oauth from "oauth4webapi";

export type MukaeTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export type DeviceAuthorization = {
  relayUrl: string;
  clientId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalSeconds: number;
};

const refreshWindowMs = 60_000;

export async function fetchPublicClients(relayUrl: string): Promise<PublicClients> {
  const response = await fetch(new URL(publicClientsPath, originOf(relayUrl)));
  if (!response.ok) throw new Error(`Mukae did not answer at ${originOf(relayUrl)}.`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!isRecord(body) || typeof body.daemonClientId !== "string") {
    throw new Error("Mukae did not list its clients.");
  }
  return { daemonClientId: body.daemonClientId };
}

export async function createAuthorizationRequest(input: {
  relayUrl: string;
  clientId: string;
  redirectUri: string;
}): Promise<{ url: string; codeVerifier: string; state: string }> {
  const server = await discover(input.relayUrl);
  if (!server.authorization_endpoint) throw new Error("Mukae did not publish a sign-in address.");
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const url = new URL(server.authorization_endpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", machinesScope);
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
}): Promise<MukaeTokens> {
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

export async function refreshMukaeAccessToken(input: {
  relayUrl: string;
  clientId: string;
  refreshToken: string;
  clientSecret?: string;
}): Promise<MukaeTokens> {
  const server = await discover(input.relayUrl);
  const client = publicClient(input.clientId);
  const auth = input.clientSecret ? oauth.ClientSecretPost(input.clientSecret) : oauth.None();
  const response = await oauth.refreshTokenGrantRequest(server, client, auth, input.refreshToken, requestOptions(input.relayUrl, originOf(input.relayUrl)));
  const tokens = await oauth.processRefreshTokenResponse(server, client, response).catch((error: unknown) => {
    throw new Error(oauthMessage(error, "Sign in again."));
  });
  return toTokens(tokens, input.refreshToken);
}

export async function beginDeviceAuthorization(input: { relayUrl: string; clientId: string }): Promise<DeviceAuthorization> {
  const server = await discover(input.relayUrl);
  const client = publicClient(input.clientId);
  const response = await oauth.deviceAuthorizationRequest(
    server,
    client,
    oauth.None(),
    new URLSearchParams({ scope: machinesScope, resource: originOf(input.relayUrl) }),
    httpOptions(input.relayUrl),
  );
  const device = await oauth.processDeviceAuthorizationResponse(server, client, response).catch((error: unknown) => {
    throw new Error(oauthMessage(error, "Mukae did not start device sign-in."));
  });
  return {
    relayUrl: originOf(input.relayUrl),
    clientId: input.clientId,
    deviceCode: device.device_code,
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    expiresAt: Date.now() + device.expires_in * 1000,
    intervalSeconds: device.interval ?? 5,
  };
}

export async function pollDeviceAuthorization(pending: DeviceAuthorization, signal?: AbortSignal): Promise<MukaeTokens> {
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
      if (!stored.refreshToken) throw new Error("Mukae did not return a refresh token.");
      return stored;
    } catch (error) {
      if (!(error instanceof oauth.ResponseBodyError)) throw error;
      if (error.error === "authorization_pending") continue;
      if (error.error === "slow_down") {
        intervalMs += 5_000;
        continue;
      }
      if (error.error === "access_denied") throw new Error("The machine was not approved.");
      if (error.error === "expired_token") throw new Error("The sign-in code expired.");
      throw new Error(error.error_description ?? "Sign-in failed.");
    }
  }
  throw new Error("The sign-in code expired.");
}

export async function listMachines(relayUrl: string, accessToken: string): Promise<Machine[]> {
  const response = await fetch(new URL(machinesPath, originOf(relayUrl)), {
    headers: { authorization: `Bearer ${accessToken}` },
    credentials: "omit",
  });
  if (response.status === 401) throw new Error("Sign in again.");
  if (!response.ok) throw new Error("Mukae did not list machines.");
  const body: unknown = await response.json().catch(() => undefined);
  if (!isRecord(body) || !Array.isArray(body.machines)) throw new Error("Mukae did not list machines.");
  return body.machines.filter(isMachine);
}

export async function openConnection(
  relayUrl: string,
  accessToken: string,
  input: { machineId: string; agentName: string },
): Promise<{ url: string; agentType: string; agentName: string }> {
  const response = await fetch(new URL(sessionsPath, originOf(relayUrl)), {
    method: "POST",
    credentials: "omit",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : "Mukae did not open the agent.";
    throw new Error(message);
  }
  if (!isRecord(body) || typeof body.url !== "string" || typeof body.agentType !== "string" || typeof body.agentName !== "string") {
    throw new Error("Mukae did not open the agent.");
  }
  return { url: body.url, agentType: body.agentType, agentName: body.agentName };
}

export const browserCallbackPath = exampleCallbackPath;

export type BrowserStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const verifierKey = "mukae.codeVerifier";
const stateKey = "mukae.state";
const accessKey = "mukae.accessToken";
const refreshKey = "mukae.refreshToken";
const expiresKey = "mukae.expiresAt";

export async function fetchMukaeUser(input: { relayUrl: string; accessToken: string }): Promise<{ sub: string }> {
  const response = await fetch(new URL("/api/auth/oauth2/userinfo", originOf(input.relayUrl)), {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok) throw new Error("Mukae did not identify the account.");
  const body: unknown = await response.json().catch(() => undefined);
  if (!isRecord(body) || typeof body.sub !== "string") throw new Error("Mukae did not identify the account.");
  return { sub: body.sub };
}

export async function requestApprovalUrl(input: {
  relayUrl: string;
  redirectUri: string;
  clientName?: string;
  logoUri?: string;
  scope?: string;
  state: string;
  codeChallenge: string;
}): Promise<string> {
  const response = await fetch(new URL(authorizeRequestPath, originOf(input.relayUrl)), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientName: input.clientName ?? `Web app at ${new URL(input.redirectUri).origin}`,
      logoUri: input.logoUri,
      redirectUri: input.redirectUri,
      scopes: (input.scope ?? machinesScope).split(" ").filter((scope) => scope.length > 0),
      state: input.state,
      codeChallenge: input.codeChallenge,
    }),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isRecord(body) || typeof body.url !== "string") {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : "Mukae did not start the approval.";
    throw new Error(message);
  }
  return body.url;
}

function cachedClientId(store: BrowserStore, relayUrl: string): string | undefined {
  return store.getItem(clientIdKey(originOf(relayUrl))) ?? undefined;
}

function cacheClientId(store: BrowserStore, relayUrl: string, clientId: string): void {
  store.setItem(clientIdKey(originOf(relayUrl)), clientId);
}

function clientIdKey(origin: string): string {
  return `mukae.clientId:${origin}`;
}

export async function beginBrowserSignIn(input: {
  relayUrl: string;
  redirectUri: string;
  store: BrowserStore;
  clientName?: string;
}): Promise<string> {
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const url = await requestApprovalUrl({
    relayUrl: input.relayUrl,
    redirectUri: input.redirectUri,
    clientName: input.clientName,
    state,
    codeChallenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
  });
  input.store.setItem(verifierKey, codeVerifier);
  input.store.setItem(stateKey, state);
  return url;
}

export async function finishBrowserSignIn(input: {
  relayUrl: string;
  redirectUri: string;
  callbackUrl: string;
  store: BrowserStore;
  clientId?: string;
  clientSecret?: string;
}): Promise<MukaeTokens> {
  const codeVerifier = input.store.getItem(verifierKey);
  const state = input.store.getItem(stateKey);
  const clientId = input.clientId ?? callbackClientId(input.callbackUrl) ?? cachedClientId(input.store, input.relayUrl);
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

const pendingCallbackExchanges = new Map<string, Promise<MukaeTokens>>();

function callbackCode(callbackUrl: string): string | undefined {
  try {
    return new URL(callbackUrl).searchParams.get("code") ?? undefined;
  } catch {
    return undefined;
  }
}

function callbackClientId(callbackUrl: string): string | undefined {
  try {
    return new URL(callbackUrl).searchParams.get("client_id") ?? undefined;
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
    const tokens = await refreshMukaeAccessToken({ relayUrl: input.relayUrl, clientId, refreshToken, clientSecret: input.clientSecret });
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

async function discover(relayUrl: string): Promise<oauth.AuthorizationServer> {
  const issuer = new URL("/api/auth", originOf(relayUrl));
  let response: Response;
  try {
    response = await oauth.discoveryRequest(issuer, httpOptions(relayUrl));
  } catch {
    throw new Error(`Mukae did not answer at ${originOf(relayUrl)}.`);
  }
  const server = await oauth.processDiscoveryResponse(issuer, response).catch(() => {
    throw new Error(`Mukae did not answer at ${originOf(relayUrl)}.`);
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

function toTokens(tokens: oauth.TokenEndpointResponse, previousRefresh?: string): MukaeTokens {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}

function writeBrowserTokens(store: BrowserStore, tokens: MukaeTokens): void {
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

function isMachine(value: unknown): value is Machine {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.hostname !== "string" || !Array.isArray(value.agents)) return false;
  return value.agents.every((agent) => isRecord(agent) && typeof agent.name === "string" && typeof agent.agentType === "string");
}
