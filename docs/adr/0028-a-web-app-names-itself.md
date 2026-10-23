# A web app names itself, and nobody registers anonymously

Status: accepted, amended by 0029. Supersedes 0021.

A web app used to have two standard ways in: register itself at the provider's registration endpoint (RFC 7591, unauthenticated), or name itself by the address of a Client ID Metadata Document. Registration was what a page served over http used, since the relay cannot fetch a document from it, so it was really the path for development. It cost a lot for that: an open endpoint anyone could fill, a pending marker on every registration, pruning those nobody approved within an hour, a reserved-name check, a registration cached in each browser, one Authorized apps row per browser, and the rate limiting it still needed.

Now a web app names itself by its metadata document, or uses a client an account registered on the relay. The relay has no anonymous registration endpoint. A copy of the app in development signs in under the published document, which lists a loopback redirect beside the real one (RFC 8252). The provider accepts a loopback redirect on any port, and the relay already asks the person on every sign-in that returns to this computer, since any program here can listen on that port. Example's document lists `http://localhost:5173/oauth/callback`, so `pnpm example` signs in to any relay as Example.

The relay knows the project's own metadata documents, Example's and the device software's, without fetching them. A relay without internet access, or one running before the documents are published, still signs in both.

The consent page no longer marks apps Unverified. The mark was for names anyone could register, and "verified" never meant that Exterior checked a name: it meant an account had registered the client, which proves nothing to another account, or that the document and the redirect shared an origin, which proves only that the origin chose the name. What the page can state truthfully is the origin the app returns to, which receives the code and cannot be faked, so it shows that under every name. A redirect to this computer is the one case where the origin says nothing, and the page warns that any program here can use it.

## Considered Options

- **Keep self-registration for development only.** Rejected. It keeps every cost above for one case a loopback redirect already covers, and an endpoint open in development is open in production.
- **Let a development relay fetch a metadata document over http from this computer.** Rejected. The client id would not be the published app's, the provider refuses non-https documents, and it is a rule no other relay would follow.
- **Register a client through an account for each developer.** Kept as the way for an app with nowhere to publish a document. It is not required for Example. [0029](0029-an-assistant-sets-up-a-web-app.md) supplies the assistant-driven setup flow.
- **Keep the Unverified mark, now for documents whose redirect is elsewhere.** Rejected. An account-registered client would still pass without anyone having checked it, and a person reads an unmarked app as checked.

## Consequences

- A third-party app needs an https address for its document, or an account that registers a client for it. A coding assistant sets up the latter with one account approval ([0029](0029-an-assistant-sets-up-a-web-app.md)).
- A development copy signs in as the published app, with the published name and logo. The consent page warns that it runs on this computer, and asks every time.
- Every app's name and logo are its own claim. Checking them would take a review process the relay does not have.
- Any program on a computer can sign in as Example through the loopback redirect, after the person approves it on a page that names the redirect host. This is the trade RFC 8252 makes for native apps.
- Authorized apps lists one row per app, however many browsers signed in.
