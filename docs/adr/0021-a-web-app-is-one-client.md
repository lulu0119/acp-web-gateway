# A web app that names itself is one client, keyed by what it shows

A web app with no registered client asks the relay for an approval, and the relay creates a client for it. It used to create one per sign-in, so a web app showed up in Authorized apps once per sign-in. Revoking one row left the other sign-ins' refresh tokens working, and the relay asked for consent again every time because the remembered consent belonged to a different client. The relay now keys these clients by the redirect address, the name, and the logo the request carries. A request with the same three reuses that client, whether it is still waiting for its first approval or already approved, so the app is one row and one revoke. A sign-in by someone who already approved it goes straight back to the app with a code. The client allows every scope a web app can be granted, so a later sign-in that asks for more still fits it. The app learns its client id from the approval address the relay returns, because a remembered approval never passes through the consent page.

## Considered Options

- **One client per redirect address, renamed by the latest request.** Rejected. Approval requests are unauthenticated, so anyone could rename the app other people approved, and the name is what the consent page and Authorized apps show.
- **One client per redirect address, named by the first request.** Rejected. Whoever asks first, including someone else, picks the name everyone later sees.
- **Merging rows on the dashboard by name or origin.** Rejected. Revoke would still leave the other clients' tokens working, and consent would still be asked every time.

## Consequences

- An app that changes its name or logo becomes a new client and a second row; the old one stays until it is revoked.
- Two first sign-ins approved at the same time can still leave two clients for one app.
- The relay no longer adds `client_id` to the redirect after consent.
