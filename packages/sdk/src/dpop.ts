/**
 * A device's key (RFC 9449). Every token the device holds is bound to it, and the device proves it holds it on
 * every request and socket, so a device id cannot be borrowed and a stolen token is useless elsewhere.
 */
export type DeviceKey = CryptoKeyPair;

const algorithm = { name: "ECDSA", namedCurve: "P-256" } as const;

/** Makes a new device key. Keep it with `exportDeviceKey`: a new key is a new device. */
export async function generateDeviceKey(): Promise<DeviceKey> {
  return await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
}

/** The private key as a JWK, which holds the public key too, for the device to keep privately. */
export async function exportDeviceKey(key: DeviceKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey("jwk", key.privateKey);
}

export async function importDeviceKey(jwk: JsonWebKey): Promise<DeviceKey> {
  const { d: _private, key_ops: _ops, ext: _ext, ...publicJwk } = jwk;
  return {
    privateKey: await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["sign"]),
    publicKey: await crypto.subtle.importKey("jwk", publicJwk, algorithm, true, ["verify"]),
  };
}

/** The device id: the key's JWK thumbprint (RFC 7638), which is the `cnf.jkt` of every token bound to it. */
export async function deviceIdOf(key: DeviceKey): Promise<string> {
  const { crv, kty, x, y } = await publicJwk(key);
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ crv, kty, x, y }))));
}

/**
 * A DPoP proof for one request: `method` on `url`, and with `accessToken` when the request carries one. A socket's
 * URL is proved in its http or https form, which is the request that upgrades it.
 */
export async function dpopProof(key: DeviceKey, method: string, url: string, accessToken?: string): Promise<string> {
  const target = new URL(url);
  target.protocol = target.protocol.replace(/^ws/, "http");
  target.search = "";
  target.hash = "";
  const { crv, kty, x, y } = await publicJwk(key);
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: { crv, kty, x, y } };
  const claims = {
    jti: base64url(crypto.getRandomValues(new Uint8Array(16)).buffer),
    htm: method,
    htu: target.href,
    iat: Math.floor(Date.now() / 1000),
    ...(accessToken ? { ath: base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken))) } : {}),
  };
  const input = `${base64url(json(header))}.${base64url(json(claims))}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, new TextEncoder().encode(input));
  return `${input}.${base64url(signature)}`;
}

async function publicJwk(key: DeviceKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey("jwk", key.publicKey);
}

function json(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
