---
name: EAP protocol and SDK split
overview: Split the protocol's code out of the product into one package, @exterioragentprotocol/sdk, then implement Exterior Agent Protocol v1 as written in docs/protocol/exterior-agent-protocol.md inside it. The Exterior product keeps GitHub sign-in, dashboard, desktop app, CLI and Example.
todos:
  - id: adrs
    content: "ADRs for the roles by scope and one OAuth client per device (amends 0014, 0019, 0020); manual note on sandboxing agents. Done: 0023 (a connection lasts as long as its socket), 0024 (one SDK)"
    status: pending
  - id: sdk-split
    content: "Create packages/sdk with root, client, client/react, device and relay entries from @exterior/contract, @exterior/client, the daemon runtime and the relay registry; delete @exterior/client; @exterior/contract keeps only product constants"
    status: pending
  - id: device-registration
    content: Check that better-auth can register a device-code client per device with the eap:device scope; otherwise a relay-side registration step for devices
    status: pending
  - id: wire-v1
    content: "Move relay, daemon, SDK and Example to the spec in place: discovery documents, eap:client and eap:device scopes, device identity from the token, coded errors, close codes in the 4100 and 4200 ranges, a ticket the dial consumes with the SDK keeping one socket per connection across a remount, close for unknown connection ids, 1013 for slow sockets, revocation closing sockets, origin check, sessionId to connectionId"
    status: pending
  - id: grants
    content: Grants per device chosen at consent, saying that later agents are included, enforced on list and open, ending live connections when a grant narrows or is revoked
    status: pending
  - id: packaging-interop
    content: Package metadata, README, preview workflow, ACP WebSocket interop test against the attach address, confirm the npm org
    status: pending
  - id: open-work-verify
    content: Update docs/open-work.md, run deslop, pnpm test and pnpm build
    status: pending
isProject: false
---

# Split the SDK and implement EAP v1

The protocol is written in [docs/protocol/exterior-agent-protocol.md](docs/protocol/exterior-agent-protocol.md). Where the code and the spec disagree, the spec wins.

## Decisions already made

- Roles: Relay, Client, Device. Scopes `eap:client` and `eap:device`. Endpoint `deviceSocket`.
- A connection lasts as long as its socket and is never resumed ([ADR 0023](docs/adr/0023-a-connection-lasts-as-long-as-its-socket.md)). A reconnecting client opens a new connection and uses ACP `session/resume` or `session/load`. No rings, frame counts, detach or offline windows.
- The dial consumes the ticket. The SDK, not the relay, keeps a remounted page on one socket.
- Each device is its own OAuth client, and its client id is the device id.
- Grants are per device and include agents added later. No device-side directory policy: `cwd` is a hint and the grant is the trust boundary.
- One package, `@exterioragentprotocol/sdk` ([ADR 0024](docs/adr/0024-the-protocol-ships-as-one-sdk.md)).

## Split

The SDK never imports product code, and the product depends on the SDK. The SDK holds what EAP v1 keeps; what v1 removes and only the product uses stays with the product until v1 deletes it.

- Root: wire schemas and parsers, message types, close codes, `Device`, `AgentSlot`, platforms.
- `client`: browser-safe. Sign-in (authorization code with PKCE, self-registration, stored tokens), `listDevices`, `openConnection`, the connector. `client/react`: `useAccount`.
- `device`: device authorization, the host that multiplexes connections onto agent processes behind a `launch` seam, line framing, and one device socket with its heartbeat and close codes.
- `relay`: the connection registry and the socket heartbeat. The app keeps its HTTP framework and plugs the registry into it.

Stays product: `apps/relay` (GitHub, better-auth, consent and dashboard, SQLite, agent icon catalog, device registration), the `exterior` CLI (config, `agent-config`, ACP registry launch, sign-in files, the reconnect loop's sign-in handling, SEA build), `apps/desktop`, `apps/example`, `@exterior/ui`, and the product constants in `@exterior/contract`.

## Order

Each step ends green on `pnpm test` and `pnpm build`.

1. Split the SDK from the code as it is, with no wire change.
2. Check the better-auth device-client registration.
3. Wire v1 in place, with relay, daemon, SDK, Example and tests together.
4. Grants per device, with live connections ended on change.
5. Packaging, README, preview workflow, the install links in `README.md` and `docs/manual.md`, and the ACP interop test.
6. `docs/open-work.md`: delete finished bullets, add the spec schema and conformance suite, and add awaiting-verification entries for a live device, relay and Example run. Then `deslop`.

Risks:

- The wire break needs the hosted relay and the desktop release to ship together. That is acceptable while the first release is unverified.
- Anonymous device registration needs rate limiting and pruning of unapproved registrations in the same change.
- A dropped network now stops the agent mid-turn. Example's reconnect has to resume the ACP session on a new connection.
