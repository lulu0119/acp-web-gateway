# A connection lasts as long as its socket

Status: accepted. Supersedes 0011.

The first EAP draft let a connection outlive its socket and its device link. Each endpoint kept a ring of the frames it sent, counted frames without putting numbers on the wire, and replayed from a position after a reattach. An audit found three faults that follow from the text. Frames from before a detach could reach the new socket ahead of the replay, because nothing on the device socket separated one attach from the next. Dropping the client's ring in the simplified draft left a client unable to tell whether a prompt, or its answer to a permission request, had reached the agent, and ACP requests are not idempotent. A reloaded page could not use the replay at all, since it holds no `initialize` result and starts its JSON-RPC ids again. ACP already restores a conversation where its state lives: `session/resume` without replay, `session/load` with it.

A connection now ends when its socket closes, when its device socket closes, or when its agent exits, and is never resumed. A client that reconnects opens a new connection and resumes the ACP session. The ticket is consumed by the dial. The relay no longer keeps an infant socket's ticket claimable: a page that mounts twice keeps one socket per connection itself, and one that dials twice opens a second connection after `ticket_rejected`. A ticket that is used, expired or unknown closes the socket with one code, `ticket_rejected`, because every case has the same remedy.

## Considered Options

- **Rings at both endpoints, as in the full draft.** Rejected. It needs a sequence number or an acknowledged attach on the device socket to be correct, and a ring on the client that a reloaded page has lost anyway. Every client, device and relay carries it to survive a dropped network for a few minutes.
- **A ring on the device only, as in the simplified draft.** Rejected. Client frames can vanish without notice, and the client cannot replay a non-idempotent request to find out.
- **Detach without replay.** Rejected. A client that misses a response while detached holds a broken ACP connection, with nothing to tell it what it missed.
- **Keep 0011's infant rule in the relay.** Rejected. It exists for pages that dial twice, and Example does not. A page that dials twice still works: the second dial is rejected, and opening again costs one extra agent start.

## Consequences

- A dropped network stops the agent, including in the middle of a turn. Whatever the agent persists of its sessions is what the client gets back.
- A device that loses its link stops all its agents and starts clean when it reconnects. `hello` carries no connections.
- The relay keeps no state per connection beyond the routing: no detach window, no offline window, no ring. Its close codes are the 4100 and 4200 ranges in the spec; 4200 `replaced` and 4201 `revoked` take the place of 0019's 4001 and 4003.
- `ticket-used`, `ticket-expired` and `ticket-gone` are no longer wire contract.
