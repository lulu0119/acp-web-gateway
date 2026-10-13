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
A computer signed in to an account with `exterior login`. It keeps a stable device id in its sign-in and stays listed while offline; it is online while its daemon is connected. Wire names still say machine (`/api/machines`, the `machines` scope, `Machine` in the contract); a live daemon connection has a machine id that changes on every reconnect.
_Avoid_: machine (in copy), gateway, host

**Sign-in**:
The credentials a machine holds for one relay. A device has at most one sign-in per relay and may have several relays.
_Avoid_: session, profile, login

**Web app**:
A site that redirects the person to Exterior to sign in, then opens an agent.
_Avoid_: Example (Example is one web app in this repo, not the product)

**Connection**:
One live ACP session with one agent on one device.
_Avoid_: port, nonce, gateway process

**Ticket**:
The single-use short-lived credential that binds one browser socket to one connection. It travels in the WebSocket URL because a browser socket cannot set `Authorization`. An infant socket that dies before any ACP frame flows does not consume it.
_Avoid_: token, code, reusable URL
