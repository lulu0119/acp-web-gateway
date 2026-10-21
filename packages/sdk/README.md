# @exterioragentprotocol/sdk

The [Exterior Agent Protocol](../../docs/protocol/exterior-agent-protocol.md) for each of its roles. A web app signs the person in through a relay, lists devices, and opens agent connections. A device runs agents for the relay. A relay joins the two. It speaks standard OAuth against any relay and never touches Exterior's login cookie.

The SDK speaks EAP v1's connections, device messages, close codes and error codes. Discovery, the `eap:client` and `eap:device` scopes, and one OAuth client per device are not implemented yet: it still finds the relay's endpoints at fixed paths and signs devices in through the relay's shared daemon client.

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

A connection lasts as long as its socket. When the socket closes, `closeReason(attachCloseCodes, event.code)` says why: `ticket_rejected` (the ticket was dialed already, or expired: open a new connection), `agent_exited`, `device_gone`, or `revoked` (sign in again first). To continue a conversation, open a new connection and use ACP `session/resume` or `session/load`. A page that may mount twice keeps one socket per connection; a second dial on the same ticket is rejected and costs a second agent start. `createAgentConnector({ relayUrl, accessToken, target })` keeps one click to one connection: `open()` shares an open already under way, and `reopen()` opens a new one.

`listDevices` and `openConnection` accept an optional `AbortSignal` as their last argument. Use it to time out a request or cancel it when the person leaves the connection form.

## Tokens

`refreshAccessToken` rotates a refresh token and throws `RefreshTokenRejectedError` when the sign-in is gone. `revokeRefreshToken` revokes one. Both are in `client` and `device`.

## Running a device

`device` is what `exterior daemon` runs on; [`docs/manual.md`](../../docs/manual.md) covers setting one up.

- `beginDeviceAuthorization({ relayUrl, clientId })` and `pollDeviceAuthorization(pending, signal)` sign a device in with a code the person approves (RFC 8628).
- `createDeviceHost({ hostname, platform, deviceId, workingDirectory, agents, send, launch })` answers the relay's `open`, `frame`, and `close` for one device socket. `launch(agentName, hooks, workingDirectory)` starts an agent and returns its pipe, or `undefined` when it cannot; `carryAgent(child, hooks, stop)` turns a started process's standard streams into that pipe, one frame per line. `setAgents` and `setWorkingDirectory` say hello again; open sessions keep their agent and directory.
- `connectDevice({ relayUrl, accessToken, host, inform, onConnected, heartbeatMs, signal })` opens one device socket, pings the relay, and resolves with how the socket ended: `replaced`, `revoked` and `unsupported_version` are the relay's close codes, `unauthorized` and `forbidden` a refused upgrade. The device's agents stop with the socket. Reconnecting is the caller's.
- `devicePlatform(process.platform)` names the platform to report.

## Running a relay

`relay` holds what a relay keeps in memory. `createRegistry({ seen, ticketTtlMs, openTimeoutMs })` tracks online devices and live sessions: `connectDaemon` for a device socket, `openSession` to start an agent and mint its ticket, `takeTicket` for an agent socket (the dial consumes the ticket), `listDevices` and `listSessions` per account, and `disconnectDevice` when a device is removed. `seen` is told when a device connects and disconnects, and turns away a device the account has not registered. `heartbeat(socket, everyMs)` pings a `ws` socket and ends it when a ping goes unanswered. HTTP routing and authentication stay with the relay's own framework.
