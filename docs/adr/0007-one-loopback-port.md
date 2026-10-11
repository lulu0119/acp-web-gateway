# One loopback port for every connection

Status: superseded by [ADR 0008](0008-account-relay.md)

Every connection is a nonce. The gateway listens only on `127.0.0.1:47321`. The page polls `https://127.0.0.1:47321/status?nonce=` and opens one WebSocket for that nonce. A failed fetch means the nonce is not published yet, so the page keeps waiting. The first launch binds the port. A later launch sends the nonce, origin, and agent type over a Unix socket the browser cannot open, then exits. Status for a nonce carries CORS only for the origin registered with it. When a socket closes, that connection's agent exits. When the last connection ends, the listener exits.

A page cannot tell a free port from a listener that refuses its origin. Safari turns a CORS-less response into a thrown error, so a probe that treats failure as an empty port starts another process on a port that is already taken.

## Considered Options

- **The page picks a port from `47321` to `47340`.** Two clicks can pick the same port before either calls `listen`. A listener that answers another origin looks empty, because the browser cannot read the refusal.
- **One process per connection on an ephemeral port, plus a directory on `47321`.** The page would still learn a second address, and the directory would be a second long-lived process beside the one that already has to own `47321`.
