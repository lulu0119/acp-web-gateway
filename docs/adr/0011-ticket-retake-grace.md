# A ticket survives an infant socket, and the client owns the retry

A web app cannot guarantee it dials once: React StrictMode mounts twice, HMR remounts, and a double click dials twice. A single-use ticket burned by the ghost dial leaves the live dial rejected, and each web app re-learns the recovery. The ticket stays single-use and short-lived, but a socket that closes before any ACP frame flows in either direction is an infant death: the same ticket can be taken again, and the second take supersedes the first. At most one browser socket owns a session at a time. Once a frame has flowed, the ticket is consumed. The relay splits the close reason into `ticket-used`, `ticket-expired`, and `ticket-gone`, and `@mukae/client` owns opening a ticket and deciding when a fresh one is needed. Web apps always open a new session, never resume.

## Considered Options

- **Reusable long-lived tickets.** Rejected. The ticket travels in the WebSocket URL, which lands in logs and history. A stolen reusable ticket is a persistent backdoor to an agent that runs code.
- **A client-only single-dial guard.** Rejected. Every web app would reimplement it, and third-party pages would still burn tickets. The protocol demanded what the framework cannot give.
- **Banning StrictMode in web apps.** Rejected. It is a dev-only bypass that hides real bugs instead of tolerating a normal framework behavior.

## Consequences

- The relay keeps the ticket mapping until the session goes live; an infant close detaches the socket without ending the session or telling the machine.
- The `ticket-*` close reasons are wire contract: clients parse them to decide between a fresh ticket and surfacing the error.
