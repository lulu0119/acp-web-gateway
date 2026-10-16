# A web app that names itself is one client per redirect address

A web app with no registered client asks the relay for an approval, and the relay creates a client for it. It used to create one per sign-in, so a web app showed up in Authorized apps once per sign-in. Revoking one row left the other sign-ins' refresh tokens working, and the relay asked for consent again every time because the remembered consent belonged to a different client. The relay now keys these clients by the redirect address. A request for the same address reuses that client, whether it is still waiting for its first approval or already approved, so the app is one row and one revoke. A sign-in by someone who already approved it goes straight back to the app with a code. The name and the icon are the app's own claim, and the latest request sets them, so renaming the app or changing its icon keeps the row. The consent page and Authorized apps show the address next to them, because the address is the part the relay can vouch for: codes only ever go there. The client allows every scope a web app can be granted, so a later sign-in that asks for more still fits it. The app learns its client id from the approval address the relay returns, because a remembered approval never passes through the consent page.

An app sends its icon as a PNG, JPEG, GIF, or WebP `data:` URI of at most 64 KB in the approval request. The relay checks that the bytes are the format they claim and serves them from `/api/client-icons/<client id>` with `nosniff` and a sandboxing CSP, so a page never loads an address an app chose and an app on `localhost` has an icon too.

## Considered Options

- **One client per redirect address, name, and logo.** Rejected. Renaming the app or changing its icon made a second row, and it guarded nothing: approval requests are unauthenticated, so anyone can already create a client with any name for any address.
- **One client per redirect address, named by the first request.** Rejected. Whoever asks first, including someone else, picks the name everyone later sees.
- **Merging rows on the dashboard by name or origin.** Rejected. Revoke would still leave the other clients' tokens working, and consent would still be asked every time.
- **An https logo address.** Deferred. Showing it loads a third-party image in the person's browser, and fetching it on the relay needs guards against private addresses. See `docs/research/2026-10-13-oauth-consent.md`.

## Consequences

- Anyone can change the name and icon that people who approved an app see for it. They cannot change the address shown beside them or receive its codes.
- Two first sign-ins approved at the same time can still leave two clients for one app.
- The relay no longer adds `client_id` to the redirect after consent.
- The icon is served as sent, not re-encoded, so a malformed image reaches the browser's decoder.
