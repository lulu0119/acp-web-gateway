# Removing a device deletes the daemon tokens stamped with its id

Status: superseded by 0026

Removing a device has to sign it out, or its daemon keeps refreshing and records the device again. Every device's daemon signs in with the same OAuth client, and a device-code grant carries no session, so nothing in a token said which device holds it. A daemon now registers its device before every connection, sending its refresh token as proof. The relay finds that token's row and stamps the device id in its `referenceId`, which the OAuth provider copies to each token a refresh issues. Removing the device deletes every daemon refresh token of the account that carries the stamp, deletes the device, and closes its daemon's socket with code 4003. The relay accepts a daemon's hello only for a device the account registered, so a daemon whose access token has not yet expired cannot put a removed device back. The daemon stops on 4003 and on a registration the relay refuses, and asks to sign in again. Signing in again binds a new token to the same id and brings the device back. `logout` revokes the refresh token through the provider's revocation endpoint.

## Considered Options

- **One OAuth client per device.** Deferred. Revoking a device would be the existing revoke-a-client path, but the daemon would need its own registration step, and the relay decides which client is a daemon by one client id ([ADR 0014](0014-tokens-are-told-apart-by-client.md)).
- **Following each refresh in a hook on the token endpoint.** Rejected. It would copy the binding onto each new token by hand, which `referenceId` already does.
- **Remembering removed device ids and turning them away.** Rejected. The refresh token stays valid, and a holder who deletes the device id file connects as a new device.
- **Marking the tokens revoked instead of deleting them.** Rejected. The provider treats a revoked refresh token presented again as a replay and revokes every refresh token of that client and account, so one removed device would sign out every other device.

## Consequences

- The relay names the token hash (`storeTokens`) so it can find a row by the token, and that hash is the provider's default, SHA-256 in base64url.
- Close code 4003 joins 4001 as wire contract between the relay and the daemon.
