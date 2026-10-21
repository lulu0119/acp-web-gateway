# A device is a key its tokens are bound to

Status: accepted. Supersedes 0014 and 0020; amends 0019.

Every daemon used to sign in with one shared OAuth client and name its own device id in `hello`. Proving which sign-in belonged to which device took a relay endpoint where the daemon posted its refresh token, so the relay could stamp the id on it. Giving each device an OAuth client of its own (RFC 7591) moved the id into the token, but a public client's id is not a secret. Every client in the grant reads device ids from the device list. Any of them could start a device code flow under a device's id, get its owner to approve the code, and connect as that device, receiving the frames of every connection opened on it.

A device is now a key. Exterior's daemon is one OAuth client, named by a Client ID Metadata Document the project publishes, with `dpop_bound_access_tokens`. A device makes a key pair for each relay and keeps the private key. It signs in with the device code grant, proving the key on each token request (DPoP, RFC 9449), so its access and refresh tokens are bound to the key. The device id is the key's thumbprint (RFC 7638), which is the token's `cnf.jkt`. The device socket upgrade carries the token with a fresh proof. The agent socket carries a proof alone, and the relay accepts it only from the device the connection was opened on.

The relay opens a device socket only while the account still has a live refresh token bound to the key. Removing a device deletes those tokens, so the access token the device still holds stops working at once. Deleting is safer than revoking here, because the provider answers a revoked token presented again by revoking every sign-in of that client and account, which is every device. Signing in again with the same key brings the device back.

## Considered Options

- **One self-registered OAuth client per device.** Rejected. The client id is public, so it identifies a device without authenticating it. It also leaves an anonymous registration on the authorization server for every machine, and MCP has deprecated dynamic registration in favour of metadata documents.
- **A device client with a secret, or with `private_key_jwt` (RFC 7523).** Rejected. Either authenticates the device at the token endpoint but not on the relay's sockets, and both still need a registration per device.
- **A stamped shared client, as before.** Rejected for the reasons above.

## Consequences

- Nothing can act as a device without its key. A phished approval adds a new device to the account; it cannot replace one.
- One key signed in to two accounts is a device of each, so no rule decides which account holds a device. The relay lists devices per account.
- A device is listed from its first device socket, not from the approval.
- The relay knows Exterior's own device metadata document without fetching it, so a relay without internet access still signs in Exterior devices. Other device software is fetched like any metadata document.
- A relay served by several processes needs one store of DPoP proofs already seen.
