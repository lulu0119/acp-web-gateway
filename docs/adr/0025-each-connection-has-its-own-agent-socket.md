# Each connection has its own agent socket

Status: accepted. Amends 0023.

A device used to carry every connection on its one device socket, each frame wrapped in a JSON message with its connection id. That one queue made the protocol carry rules it existed only to survive. A slow browser could stall every other connection of its device, so the relay closed a socket that fell behind instead of slowing it. An agent that left its input unread was stopped for the same reason. A frame escaped into JSON could grow to six times its size. Frames the agent wrote before a client attached had to be held by the relay. A frame for a connection the relay had already forgotten needed its own rule.

The device socket now carries only `hello`, `open` and `open_failed`. When the relay sends `open`, the device starts the agent and dials an agent socket for that connection alone, at `/eap/v1/device/connections/{connectionId}`. That dial is the answer to `open`. The relay joins it to the client's attach socket one to one, and either socket closing closes the other. The agent socket carries frames exactly as the attach socket does. Each hop applies backpressure: the relay stops reading one socket while the other has unsent data, and the device stops reading the agent's output while its socket is behind. The relay reads nothing from the agent socket until a client attaches, so an agent that writes first waits on its pipe.

The connection id is the agent socket's credential. It has 128 bits of randomness, reaches only the device over its authenticated device socket, and is accepted once, while the connection is opening. The device needs no fresh access token for each dial.

## Considered Options

- **Keep one multiplexed device socket.** Rejected. Flow control per connection would need credits or acknowledgements inside the device socket, which is the work WebSocket and TCP already do per socket.
- **The device dials only once a client attaches.** Rejected. The client's first frames would wait in the relay for a socket that is not there yet, and the open would answer before the device could say whether it reached the relay.
- **A bearer token on the agent socket.** Rejected. The device would have to refresh its token before every dial, and the connection id is already unguessable and single-use.

## Consequences

- A connection does not depend on the device socket. A device whose device socket drops and reconnects keeps its running agents.
- Opening a connection costs one more WebSocket handshake, against an agent start that already takes seconds.
- The relay holds one socket per device and two per connection.
- The device closes the agent socket with 1000 when the agent ends, which the client hears as `agent_exited`, and with 1001 when it shuts down, heard as `device_gone`.
- `frame`, `opened` and `close` are no longer device socket messages.
