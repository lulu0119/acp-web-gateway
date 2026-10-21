# @exterioragentprotocol/sdk

The [Exterior Agent Protocol](../../docs/protocol/exterior-agent-protocol.md) for each of its roles. A web app signs the person in through a relay, lists devices, and opens agent connections. A device runs agents for the relay. A relay joins the two. It speaks standard OAuth against any relay and never touches Exterior's login cookie.

The SDK speaks EAP v1 as the spec states it: the endpoints under `/eap/v1/`, the authorization server found from the relay's protected resource metadata, the `eap:client` and `eap:device` scopes, devices identified by a key their tokens are bound to (DPoP), and one agent socket per connection.

Install (until the npm release):

```bash
pnpm add https://pkg.pr.new/lulu0119/exterior/@exterioragentprotocol/sdk@main
```

Import only the entry for your role. `client` and the root run in a browser; `device` and `relay` need Node.

| Entry | For |
| --- | --- |
| `@exterioragentprotocol/sdk/client` | A web app: sign-in, devices, connections. |
| `@exterioragentprotocol/sdk/client/react` | A React web app: `useAccount`. |
| `@exterioragentprotocol/sdk/device` | A daemon: device sign-in, the device socket, and agent processes. |
| `@exterioragentprotocol/sdk/relay` | A relay: the device and connection registry. |
| `@exterioragentprotocol/sdk` | The wire messages, paths, and close codes every role shares. |

## Quick start (React)

```tsx
import { useAccount } from "@exterioragentprotocol/sdk/client/react";

const session = useAccount(relayUrl, {
  redirectUri: `${window.location.origin}/oauth/callback`,
  clientId: "https://my-app.example.com/oauth-client.json",
});

if (session.account.phase === "signed-in") {
  // session.account.accessToken opens listDevices / openConnection.
}
```

`useAccount(relayUrl, init)` returns `{ account, busy, error, signIn, signOut }`. `account` is `{ phase: "checking" }`, `{ phase: "signed-out" }`, or `{ phase: "signed-in"; accessToken }`. `init` takes `redirectUri` (default `<page origin>/oauth/callback`), `returnTo` (default `/`), and one of the client forms below. `signIn` navigates to the relay; on return the hook redeems the code, replaces the address bar with `returnTo`, and stores the tokens in `sessionStorage`. `signOut` clears them.

## Which client id

Pass `clientId` when the app has one, otherwise omit it and pass `clientName` and `logoUri` for the relay to show:

- A client an account registered from the relay dashboard: its client id.
- A published app: the https address of its Client ID Metadata Document. The relay reads the name, logo, and redirect address from that file, and the app is one authorized row everywhere.
- Nothing (local development): the app registers itself with the relay (RFC 7591) on the first sign-in. The registration is kept in `localStorage`, one per relay and redirect address, so the app is one row per browser that signed in. It is finished only after an approval, so a registration nobody approved is not reused.

A redirect to `localhost` is asked every time, even for an approved app: any process on the computer can listen on that port, so the address proves nothing about which program asks (OAuth 2.1 §7.3).

## Without React

`beginBrowserSignIn({ relayUrl, redirectUri, store, registrations, clientId, clientName, logoUri })` returns the relay address to navigate to. Pass `sessionStorage` as `store` and `localStorage` as `registrations`. `finishBrowserSignIn({ relayUrl, redirectUri, callbackUrl, store, registrations, clientId, clientSecret })` redeems the code on return; when a framework mounts the callback twice, racing callers share one redemption. `storedAccessToken({ relayUrl, store, clientId, clientSecret })` returns a live access token, refreshing within the last minute of expiry, or `undefined`. `clearBrowserSignIn(store)` signs out. `registerBrowserClient({ relayUrl, redirectUri, clientName, logoUri })` registers directly and returns the client id.

## Devices and connections

With an access token: `listDevices(relayUrl, accessToken)` lists the account's online devices, each with its agents and its `platform` (`macos`, `windows`, or `linux`); `openConnection(relayUrl, accessToken, { deviceId, agentName })` starts the agent and returns `{ url, agentType, expiresAt }`: dial `url` once, before `expiresAt`, and use it as the ACP connection. A request the relay refuses throws `RelayError`; decide by its `code` (`target_not_found`, `agent_start_failed`, `device_timeout`, …).

A connection lasts as long as its socket. When the socket closes, `closeReason(attachCloseCodes, event.code)` says why: `ticket_rejected` (the ticket was dialed already, or expired: open a new connection), `agent_exited`, `device_gone`, or `revoked` (sign in again first). To continue a conversation, open a new connection and use ACP `session/resume` or `session/load`. A page that may mount twice keeps one socket per connection; a second dial on the same ticket is rejected and costs a second agent start.

`listDevices` and `openConnection` accept an optional `AbortSignal` as their last argument. Use it to time out a request or cancel it when the person leaves the connection form.

## Tokens

`refreshAccessToken` rotates a refresh token and throws `RefreshTokenRejectedError` when the sign-in is gone. `revokeRefreshToken` revokes one. Both are in `client` and `device`.

## Running a device

`device` is what `exterior daemon` runs on; [`docs/manual.md`](../../docs/manual.md) covers setting one up.

- `generateDeviceKey()` makes a device's key, and `exportDeviceKey` and `importDeviceKey` keep it as a private JWK. Keep one per relay: a new key is a new device. `deviceIdOf(key)` is its thumbprint, the device id. `dpopProof(key, method, url, accessToken?)` proves the key for one request (RFC 9449).
- `beginDeviceAuthorization({ relayUrl, clientId })` and `pollDeviceAuthorization(pending, key, signal)` sign a device in with a code the person approves (RFC 8628). `clientId` is the device software's: a metadata document address or a client id the relay issued. The tokens are bound to `key`, and `refreshAccessToken` takes it as `deviceKey`.
- `createDeviceHost({ relayUrl, deviceKey, hostname, platform, workingDirectory, agents, launch, heartbeatMs })` runs the device's agents. For each `open` it calls `launch(agentName, workingDirectory)`, which returns `{ child, stop }` for a started process or a reason it cannot start one, then dials that connection's agent socket with a proof of the key and carries the agent over it, one frame per line, with backpressure both ways (`carryAgent`). The agent ending closes the socket, and the socket closing stops the agent. `setAgents` and `setWorkingDirectory` say hello again; running agents keep their agent and directory. `stop()` stops every agent, as the device shuts down.
- `connectDevice({ relayUrl, accessToken, deviceKey, host, inform, onConnected, heartbeatMs, signal })` opens one device socket with the key-bound token and a proof, attaches the host to it, pings the relay, and resolves with how the socket ended: `replaced` and `revoked` are the relay's close codes, `unauthorized` and `forbidden` a refused upgrade, and `unsupported_version` a relay without this version's path. Agents keep running across device sockets; reconnecting is the caller's.
- `devicePlatform(process.platform)` names the platform to report.

## Running a relay

`relay` holds what a relay keeps in memory. `createRegistry({ seen, ticketTtlMs, openTimeoutMs })` tracks online devices and live connections:

- `connectDevice({ userId, deviceId, send, close })` for a device socket the relay admitted, with the device id read from its token's `cnf.jkt`.
- `openConnection` sends `open` and resolves with the ticket once the device dials the agent socket.
- `acceptAgent({ connectionId, deviceId }, socket)` for an agent socket whose proof named `deviceId` and `acceptClient(ticket, socket)` for an attach socket. Each takes a `FrameSocket` (`send(frame, flushed)`, `unsent()`, `pause()`, `resume()`, `close`) and returns the link its handler reports frames and the close to, or `undefined` when the dial is refused. The registry joins the two and pauses one while the other is behind.
- `listDevices` and `listConnections` per account, `removeDevice` when a device is removed, and `revokeClient` when an account revokes a client.

`seen` is told when a device says hello and when its socket closes, so the relay can list it while offline. `heartbeat(socket, everyMs)` pings a `ws` socket and ends it when a ping goes unanswered. HTTP routing and authentication stay with the relay's own framework.
