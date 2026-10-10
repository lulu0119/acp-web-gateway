# One gateway process per connection

Status: accepted

A web app can hold several connections to local agents at once. Each connection runs its own gateway process on its own port from `47321` to `47340`. The launch URL carries the port, and the web app picks the first port that no gateway answers on.

## Considered Options

- **One long-running gateway that accepts many sockets.** Rejected for now. It changes the lifecycle the first version relies on: the process exits when its socket closes, and the browser prompt is the only confirmation per connection. A shared process would also need its own state for each nonce.
- **One port for all connections.** Rejected. A second launch would find the port taken, and the browser cannot tell a new gateway from one that is still answering for another connection.
