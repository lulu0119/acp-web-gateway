---
name: EMP protocol and SDK split
overview: Implement Exterior Model Protocol v1 as written in docs/protocol/exterior-model-protocol.md, then split the protocol and its SDKs into @exteriormodelprotocol/* packages. The Exterior product keeps GitHub sign-in, dashboard, desktop app, CLI and Example.
todos:
  - id: adrs
    content: "Write CONTEXT.md terms (Relay, Client, Device as a registration, Connection as an ACP connection); ADRs for the name and roles, detachable connections with device grace (supersedes 0011), scoped grants and no directory policy, device identity as client per device and role by scope (amends 0014, 0019, 0020); decisions.md; manual note on sandboxing agents"
    status: pending
  - id: prototype
    content: Prototype detach and device grace with endpoint-held rings and implicit frame counts; fault-inject (kill the client socket, kill the device link, sleep past 300 seconds); check that better-auth can register a device-code client with the emp:device scope
    status: pending
  - id: wire-v1
    content: "Move relay, daemon, SDK and Example to the spec in place: discovery documents, emp:client and emp:device scopes, device identity from the token, connection resource (open, list, get, attach, end), hello with connections, resume and detach messages, coded errors, close codes 4100 and 4200 ranges, origin check, sessionId to connectionId"
    status: pending
  - id: scoped-grants
    content: Grants per device and agent chosen at consent, enforced on list and open, ending live connections when a grant changes or is revoked
    status: pending
  - id: extract-protocol
    content: Extract @exteriormodelprotocol/protocol from @exterior/contract; move product constants and helpers to their owners
    status: pending
  - id: split-client-device
    content: Split @exterior/client into @exteriormodelprotocol/client and /device; move the daemon runtime behind a launch seam; the CLI depends on /device
    status: pending
  - id: extract-relay
    content: Extract @exteriormodelprotocol/relay from apps/relay with authenticate, grants and device-directory seams; apps/relay plugs in better-auth
    status: pending
  - id: packaging-interop
    content: Package metadata, READMEs, preview workflow, ACP WebSocket interop test against the attach address, confirm the npm org
    status: pending
  - id: open-work-verify
    content: Update docs/open-work.md, run deslop, pnpm test and pnpm build
    status: pending
isProject: false
---

# Implement EMP v1 and split the SDK

The protocol is decided and written in [docs/protocol/exterior-model-protocol.md](docs/protocol/exterior-model-protocol.md). This plan implements it. Where the code and the spec disagree, the spec wins.

## Decisions already made

- Roles: Relay, Client, Device. Scopes `emp:client` and `emp:device`. Endpoint `deviceSocket`.
- Connections are resources and are detachable. The endpoints own the stream (rings and implicit counts), the relay holds no frames. A device keeps its agents through a lost link.
- Detach and device-offline windows are fixed relay limits (300 seconds recommended). No lease.
- Each device is its own OAuth client, and its client id is the device id.
- Grants are per device and agent. No device-side directory policy: `cwd` is a hint and the grant is the trust boundary.
- Packages live under `@exteriormodelprotocol/`: `protocol`, `client`, `device`, `relay`.

## Split

SDK packages never import product code, and product depends on the SDK.

- `protocol`: wire schemas, constants, close and error codes, version. From `@exterior/contract`, without product pieces.
- `client`: client role, browser-safe, with `/react`. From `@exterior/client`, without device grant and registration. Its connector owns attach, the send ring and resume.
- `device`: device client registration, device authorization, and the reconnect, heartbeat, multiplex and ring runtime (today [`daemon.ts`](packages/gateway/src/daemon.ts) and the protocol half of [`host.ts`](packages/gateway/src/host.ts)). One seam: `launch(agentName, workingDirectory) -> pipe`.
- `relay`: connection records and routing, routes and sockets from [`registry.ts`](apps/relay/src/server/connections/registry.ts). It holds no frames. Seams: `authenticate`, `grants`, device directory. Move `LiveSessionInfo` out of `shared/account-web.ts` so the core has no product type.

Publishing: an app installs one role package. `client`, `device` and `relay` each depend on `protocol` and re-export the types and error classes their users need, so an app never imports `protocol` itself. All four packages share one version and are published by one workflow. They depend on each other at that exact version (`workspace:*` becomes it on publish), so one `protocol` is installed and `instanceof` on shared error classes holds. `protocol` is not bundled into the others.

Stays product: `apps/relay` (GitHub, better-auth, consent and dashboard, SQLite, agent icon catalog), the `exterior` CLI (config, `agent-config`, ACP registry launch, sign-in files, SEA build), `apps/desktop`, `apps/example`, `@exterior/ui`.

Leaves contract for its owner: `defaultRelayUrl`, `exampleCallbackPath`, `acpRegistryUrl`, `registryIconUrl`, `isAgentType`, `isEnvName`, `isRecord`, `devicePlatform(nodePlatform)`, `grantsPath`, `clientRegistryPath`.

## Order

Each step ends green on `pnpm test` and `pnpm build`. Prototype first, fix the wire once, then move files.

1. ADRs and glossary.
2. Prototype detach, device grace and resume with fault injection, and check the better-auth device-client registration. If it does not accept the device-code grant, the fallback is a relay-side registration step for devices.
3. Wire v1 in place, with relay, daemon, SDK, Example and tests together.
4. Scoped grants, with live connections ended on change.
5. Extract `protocol`, then split `client` and `device`, then extract `relay`. Delete `@exterior/contract` and `@exterior/client` when the last import is gone. Neither was ever on npm, so there is no deprecation or compatibility layer.
6. Packaging, READMEs, preview workflow (it publishes `exterior`, `@exterior/contract` and `@exterior/client` today), the install links in `README.md`, `docs/manual.md` and the client README, and the ACP interop test.
7. `docs/open-work.md`: delete finished bullets, add the spec schema and conformance suite, and add awaiting-verification entries for a live device, relay and Example run, and for resume after a real network drop. Then `deslop`.

Risks:

- The wire break needs the hosted relay and the desktop release to ship together. That is acceptable while the first release is unverified.
- Resume has no precedent: ACP's own remote transport defers it. The prototype can send the design back before the wire changes.
- Anonymous device registration needs rate limiting and pruning of unapproved registrations in the same change.
- Example's session handling changes with detachable connections.
