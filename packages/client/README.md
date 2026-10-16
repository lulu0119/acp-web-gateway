# @exterior/client

The web app side of Exterior: sign the person in through the relay, then list devices and open agent connections. It speaks standard OAuth against any relay and never touches Exterior's login cookie.

Install (until the npm release):

```bash
pnpm add https://pkg.pr.new/lulu0119/exterior/@exterior/client@main
```

## Quick start (React)

```tsx
import { useAccount } from "@exterior/client/react";

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

## Devices and agents

With an access token: `listDevices(relayUrl, accessToken)` lists the account's devices; `openConnection(relayUrl, accessToken, { deviceId, agentName })` returns a one-time ticket `{ url, agentType, agentName }` to use as the ACP connection. `createAgentConnector({ relayUrl, accessToken, target })` owns the ticket lifecycle for one user intent: `open()` never mints two tickets for one click, `reopen()` takes a fresh ticket, and sessions are never resumed. `parseTicketCloseReason` reads the relay's `ticket-used` / `ticket-expired` / `ticket-gone` close reasons; `needsFreshTicket` says whether a fresh ticket is the recovery.

## Tokens and identity

`refreshExteriorAccessToken` rotates a refresh token and throws `RefreshTokenRejectedError` when the sign-in is gone. `revokeRefreshToken` revokes one. `fetchExteriorUser({ relayUrl, accessToken })` returns the account id. `fetchPublicClients(relayUrl)` returns the relay's daemon client id.

The device-code half (`beginDeviceAuthorization`, `pollDeviceAuthorization`, `registerDevice`) belongs to `exterior login`, not to browsers, and is documented in [`docs/manual.md`](../../docs/manual.md).
