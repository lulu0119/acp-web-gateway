# EAP endpoints are fixed, versioned paths

Status: accepted

EAP's endpoints sit at fixed paths under the relay address, with the version in the path: `/eap/v1/devices`, `/eap/v1/connections`, `/eap/v1/device`, and the agent socket below it. The authorization server is found the standard way, from the relay's protected resource metadata (RFC 9728). The attach address is the one endpoint not fixed: the relay returns it with each connection.

A device used to state a protocol version in `hello`, and a relay that did not speak it closed the socket with `unsupported_version`. The path already says the version, so a device that dials a version the relay does not serve gets 404 before the upgrade, and `hello` carries no version.

## Considered Options

- **An EAP metadata document listing every endpoint and the relay's limits.** Rejected. It is one more fetch and one more document for every client and device, to let a relay choose paths nobody needs to choose. The frame size is fixed by the protocol instead, and the open and ticket timeouts are the relay's own, reported as `expiresAt` and `device_timeout`.
- **The version in `hello` as well as the path.** Rejected. Two places to state one fact, and a close code for the case where they disagree.

## Consequences

- A relay serves two versions side by side under two paths.
- The device socket close codes are 4200 `replaced`, 4201 `revoked` and 4202 `invalid_message`.
