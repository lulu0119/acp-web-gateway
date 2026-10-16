# A web app registers itself, or names itself by its own document

A web app with no client of its own used to ask the relay for an approval, and the relay created a client for every sign-in: the app was listed in Authorized apps once per sign-in, revoking one row left the others working, and consent was asked again each time. The relay also had its own way of starting an approval and handing the app a client id, which no other OAuth client knows.

Now a web app registers itself at the provider's own registration endpoint (RFC 7591, unauthenticated), or, when it is served over https, names itself by the address of a metadata document the relay reads (Client ID Metadata Documents, as MCP requires and `@better-auth/cimd` implements). Both are standard, and the relay publishes them in its OAuth metadata. A metadata document's origin is the app's identity: the document is fetched from that address, and the redirect it names must return there. Consent, tokens, and revocation are unchanged.

The relay had to keep two things from the old path:

- **Consent for a redirect to this computer.** Any process here can listen on `localhost:5173`, so the address proves nothing about which program asks, and OAuth 2.1 §7.3 forbids answering such a request from an earlier approval. Every authorization request whose redirect is a loopback address gets `prompt=consent`, and its `prompt=none` is dropped. A registration is still what makes an app ask, so a registration nobody approved within an hour is deleted, which bounds what an unauthenticated endpoint can add to the database.
- **The name and logo.** They come from the app, as the spec says they may, and the pages show the redirect host beside them, which the app cannot change. The consent page marks such an app Unverified unless an account registered it or its metadata document vouches for it.

A logo is loaded by the browser from the address the app named, which is what `logo_uri` means. That costs two things the earlier `data:` scheme avoided: the app learns that someone opened a page that shows its logo, and it can change the logo after approval. RFC 7591 §5 accepts both, and both are recorded here rather than defended against.

## Considered Options

- **One client per redirect address, minted by the relay.** Rejected as the whole mechanism. It made the app one row and one revoke, and it was the relay's own convention; a standard OAuth client cannot discover or use it. Kept only as the registration the standard names.
- **Fetching each app's logo on the relay and serving it.** Deferred. It needs SSRF guards, a byte limit, and re-encoding, and a logo can be an inline image instead. See `docs/research/2026-10-13-oauth-consent.md`.
- **Not letting unauthenticated apps register at all.** Rejected. It is how the spec expects a web app or an MCP client to arrive, and a client nobody approved is inert until a person consents.
- **Signing the app out when its registration is pruned.** Rejected. Better Auth treats a refresh with a deleted client as a replay and revokes every token of that client and account, and one registration per browser would sign out the others.

## Consequences

- A local app registers once per browser and relay, so Authorized apps lists one row per browser that signed in. A published app names one metadata document, so it is one row everywhere.
- A pruned registration is re-registered on the next sign-in, with a new client id.
- An app on `localhost`, registered through the dashboard or itself, shows consent on every sign-in.
- The relay keeps two open, unauthenticated endpoints, the registration endpoint and a metadata fetch. Both are rate-limiting territory; see `open-work.md`.
- The daemon still tells `/api/devices` the refresh token that proves its device, which is the relay's own endpoint, not a standard one.
