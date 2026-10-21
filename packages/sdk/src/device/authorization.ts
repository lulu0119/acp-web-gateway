import { devicesScope } from "../index.js";
import * as oauth from "oauth4webapi";
import { discover, httpOptions, oauthMessage, originOf, publicClient, requestOptions, toTokens, type Tokens } from "../oauth.js";

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

export async function pollDeviceAuthorization(pending: DeviceAuthorization, signal?: AbortSignal): Promise<Tokens> {
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
