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
A computer signed in to an account with the desktop app or `exterior login`. On each relay it holds a key its tokens are bound to, and the key's thumbprint is its device id, which signing out does not change. It is listed once it first connects, stays listed while offline, is online while its device socket is open, and is listed once however often it reconnects. Removing a device signs it out; signing it in again brings it back under the same id.
_Avoid_: machine, gateway, host

**Sign-in**:
The credentials a device holds for one relay. A device has at most one sign-in per relay and may have several relays. The command verb stays `exterior login`/`logout` (the action); the noun is always sign-in (the state and the credential).
_Avoid_: session, profile, login

**Web app**:
A site that redirects the person to Exterior to sign in, then opens an agent.
_Avoid_: Example (Example is one web app in this repo, not the product)

**Client**:
The OAuth identity a web app signs in with: its metadata document's address, or an id an account registered. A development copy of the app signs in as the same client through a loopback redirect. One client is one row in Authorized apps.
_Avoid_: account, device

**Connection**:
One running agent process on one device: one ACP connection, which may hold several ACP sessions. Opened with `POST /eap/v1/connections` (`openConnection` in the SDK). The relay joins the web app's attach socket to the device's agent socket for it. It ends when either socket closes and is never resumed; a web app that reconnects opens a new one and resumes the ACP session. Neither the browser session nor a device sign-in.
_Avoid_: session (an ACP session lives inside a connection), port, nonce, gateway process

**Device socket**:
The one WebSocket a device keeps open to the relay, for `hello`, `open` and `open_failed`. No frames cross it, and connections outlive it.
_Avoid_: daemon socket, control channel

**Agent socket**:
The WebSocket a device dials for one connection, carrying that agent's frames. The device proves its key on the dial, and the relay accepts it only for a connection opened on that device.
_Avoid_: data socket, session socket

**Desktop app**:
The tray app on a device that runs one daemon per sign-in, starts at login, and edits agent configurations in its window. Quitting it takes the device offline.
_Avoid_: tray (for the whole app), GUI, client (a web app is the client)

**Working directory**:
The directory on a device an agent session works in. A web app runs on another computer, so a session without a chosen directory uses the device's own, which the device reports when it connects. The device's own is a setting (`exterior config set`, or the desktop app's folder picker) and defaults to `~/.local/share/exterior/workspace`. A running daemon opens later sessions in a changed directory; open sessions keep the one they started in.
_Avoid_: `/` as "no directory", workspace (Example's word for a directory the person added)

**MCP endpoint**:
An MCP server a web app serves from its page through the relay, for tools that run in the page. The agent reaches it over HTTP at the relay with the endpoint's token; the page holds its MCP socket, and the endpoint ends with that socket. Opened with `POST /eap/v1/mcp-endpoints` (`serveMcp` in the SDK).
_Avoid_: MCP gateway, bridge, tunnel, tool server

**Ticket**:
The single-use short-lived credential that binds one browser socket to one connection. It travels in the WebSocket URL because a browser socket cannot set `Authorization`. Dialing it consumes it.
_Avoid_: token, code, reusable URL
