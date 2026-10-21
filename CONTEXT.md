# Exterior

An account that lets a web app reach an ACP agent on a machine the person owns.

## Language

**Exterior**:
The product name. An external brain: the relay that lends a web app reach to an agent on a machine the person owns.
_Avoid_: ACP Gateway, acp-web-gateway

**User**:
The person who signs in. One user has many devices. The person is better-auth's `user`; the browser cookie session is this user's login state, not a device sign-in. better-auth's `account` is something else — the linked GitHub login — which Exterior does not surface. UI copy may still say "your account" for the user's own.
_Avoid_: account (for the person), workspace, team

**Device**:
A computer signed in to an account with the desktop app or `exterior login`. It keeps one device id per relay, which signing out does not change, and stays listed while offline; it is online while its daemon is connected, and listed once however often that daemon reconnects. A daemon connects only as a device its account registered. Removing a device signs it out; signing it in again brings it back under the same id.
_Avoid_: machine, gateway, host

**Sign-in**:
The credentials a device holds for one relay. A device has at most one sign-in per relay and may have several relays. The command verb stays `exterior login`/`logout` (the action); the noun is always sign-in (the state and the credential).
_Avoid_: session, profile, login

**Web app**:
A site that redirects the person to Exterior to sign in, then opens an agent.
_Avoid_: Example (Example is one web app in this repo, not the product)

**Client**:
The OAuth identity a web app signs in with: a dashboard-registered id, a metadata document address, or a self-registration one browser keeps. One client is one row in Authorized apps.
_Avoid_: account, device

**Connection**:
One running agent process on one device, reached through one socket: one ACP connection, which may hold several ACP sessions. Opened with `POST /api/connections` (`openConnection` in the SDK). It ends when its socket closes and is never resumed; a web app that reconnects opens a new one and resumes the ACP session. Neither the browser session nor a device sign-in.
_Avoid_: session (an ACP session lives inside a connection), port, nonce, gateway process

**Desktop app**:
The tray app on a device that runs one daemon per sign-in, starts at login, and edits agent configurations in its window. Quitting it takes the device offline.
_Avoid_: tray (for the whole app), GUI, client (a web app is the client)

**Working directory**:
The directory on a device an agent session works in. A web app runs on another computer, so a session without a chosen directory uses the device's own, which the device reports when it connects. The device's own is a setting (`exterior config set`, or the desktop app's folder picker) and defaults to `~/.local/share/exterior/workspace`. A running daemon opens later sessions in a changed directory; open sessions keep the one they started in.
_Avoid_: `/` as "no directory", workspace (Example's word for a directory the person added)

**Ticket**:
The single-use short-lived credential that binds one browser socket to one connection. It travels in the WebSocket URL because a browser socket cannot set `Authorization`. Dialing it consumes it.
_Avoid_: token, code, reusable URL
