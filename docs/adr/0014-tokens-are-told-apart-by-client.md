# Tokens are told apart by the client they were issued to

Status: superseded by 0026

The daemon and web apps both hold access tokens for the relay with the `machines` scope. The relay now reads the `azp` claim and routes on it: only the daemon client's tokens open `/api/daemon` and record devices on `/api/devices`; only other clients' tokens list machines and open sessions. Before this, an approved web app could connect as a daemon, appear as a device, and receive the ACP frames of sessions opened on it; a signed-in device could open agents on the account's other devices.

## Considered Options

- **Separate scopes per role** (`daemon` versus `agents:connect`). The right end state, and part of the scope redesign in `docs/open-work.md`. It needs every client and stored grant to move at once, so it comes later; checking `azp` closes the hole now without a migration.
- **Separate audiences per role.** Same migration cost as scopes, and better-auth links one resource per client.
