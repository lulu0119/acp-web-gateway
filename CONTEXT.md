# Exterior

An account that lets a web app reach an ACP agent on a machine the person owns.

## Language

**Exterior**:
The product name. An external brain: the relay that lends a web app reach to an agent on a machine the person owns.
_Avoid_: ACP Gateway, acp-web-gateway

**Account**:
The person who signs in. One account can have many devices.
_Avoid_: user, workspace, team

**Device**:
A computer signed in to an account with the desktop app or `exterior login`. It keeps one device id per relay, which signing out does not change, and stays listed while offline; it is online while its daemon is connected, and listed once however often that daemon reconnects. A daemon connects only as a device its account registered. Removing a device signs it out; signing it in again brings it back under the same id.
_Avoid_: machine, gateway, host

**Sign-in**:
The credentials a device holds for one relay. A device has at most one sign-in per relay and may have several relays.
_Avoid_: session, profile, login

**Web app**:
A site that redirects the person to Exterior to sign in, then opens an agent.
_Avoid_: Example (Example is one web app in this repo, not the product)

**Connection**:
One live ACP session with one agent on one device.
_Avoid_: port, nonce, gateway process

**Desktop app**:
The tray app on a device that runs one daemon per sign-in, starts at login, and edits agent configurations in its window. Quitting it takes the device offline.
_Avoid_: tray (for the whole app), GUI, client (a web app is the client)

**Working directory**:
The directory on a device an agent session works in. A web app runs on another computer, so a session without a chosen directory uses the device's own, `~/.local/share/exterior/workspace`, which the device reports when it connects.
_Avoid_: `/` as "no directory", workspace (Example's word for a directory the person added)

**Ticket**:
The single-use short-lived credential that binds one browser socket to one connection. It travels in the WebSocket URL because a browser socket cannot set `Authorization`. An infant socket that dies before any ACP frame flows does not consume it.
_Avoid_: token, code, reusable URL
