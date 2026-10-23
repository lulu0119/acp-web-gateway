# Connect a web app to Exterior

Instructions for a coding assistant integrating a new or existing app. Use an existing relay; the default is `https://relay.apps.superpowerlulu.win`. Device and relay operation is in [the manual](manual.md); the supported client interface is in [the SDK README](../packages/sdk/README.md).

## Inspect

Read the SDK README before changing the app. Inspect the worktree, package manager, framework, base path, existing OAuth configuration, and tests. Preserve unrelated work. Identify the app's name, its actual local origin, and the complete callback path. A Vite app under `/playground/` might return to `http://127.0.0.1:5180/playground/oauth/callback`. Keep `localhost` and `127.0.0.1` consistent with the page the person opens.

## Establish the app identity

If the app already has a client id on this relay, or an https Client ID Metadata Document that lists the callback, use it and skip to the next section. A relay-issued id belongs to that relay. A published metadata identity can be used across relays. Changing from one identity to another can require users to authorize again.

Otherwise register the app with two plain HTTP calls; no Exterior software is needed:

1. Choose a random setup id of 22 to 128 letters, digits, `-` or `_`, such as a UUID. Build the link with the app's name (1 to 64 characters, not starting with "Exterior") and its callback (https, or http on `localhost`, `127.0.0.1`, or `[::1]`), each URL-encoded:

   ```
   <relay>/apps/register?setup_id=<id>&client_name=<name>&redirect_uri=<callback>
   ```

   Give the link to the person. They sign in to the relay and confirm the prefilled registration, on this computer or another.

2. Poll every two seconds while they decide:

   ```sh
   curl -s -w '\n%{http_code}\n' <relay>/api/clients/setup/<id>
   ```

   - `202` `{ "status": "pending" }`: keep polling. If nothing changes for several minutes, ask the person whether they opened the link.
   - `200` `{ "status": "registered", "clientId", "clientName", "redirectUri" }`: check that the name and callback are the ones you sent, then stop.
   - `200` `{ "status": "denied" }`: the person cancelled. Ask before starting again with a new id.
   - `200` `{ "status": "failed", "code", "message" }`: report the message.
   - `404`: this relay predates app setup. Use another relay, or an existing client id.

The result stays for ten minutes after the person decides. It contains no account tokens. Setting up again for the same account, name, and callback returns the same client id. Registration does not grant access to devices.

If the person already registered the app with Register app on the relay's dashboard, use the client id they give you instead.

Save the relay address, client id, and callback where the app keeps its configuration. All three are public and can be committed.

## Integrate and verify

Install the SDK using its documented package address. Pass its relay, client id, and callback to `useAccount`. Set `returnTo` to the app's own base path. Use `session.listDevices()` and `session.openConnection(...)`; they obtain live tokens. Own one WebSocket per returned connection, dial its ticket once, and close it when the connection is abandoned. A dropped connection needs a new connection; follow the SDK's ACP resume guidance rather than replaying pending requests.

Run the app's checks and build. Start it at the configured origin and have the person sign in and approve device access. Devices must be signed in and online on the same relay; offer the manual's device setup only when needed. Verify device discovery, opening an installed agent, and ACP `initialize` with that agent. App-specific dependencies such as a codemode proxy remain the app's responsibility.

Report where the configuration lives, the relay and public identity, changed code, checks run, and which live steps actually succeeded. Setup is complete only when the app can sign in and initialize a real agent; if credentials, a device, or an agent are unavailable, name that exact remaining step. Publish or commit only when requested.
