# A machine keeps one sign-in per relay

A machine can be signed in to several relays, such as a shared one and a local one. A command picks the relay from `--relay` or `MUKAE_RELAY`. When neither is given, a machine with one sign-in uses that one, and a machine with several stops and lists the choices. Nothing remembers an "active" relay, because a long-running daemon that silently follows a switch made in another terminal connects to the wrong place. Each sign-in is its own file, because each refresh rotates the refresh token: two daemons for two relays that rewrote one shared file could drop the other's new token and force a fresh login.

## Considered Options

- **One sign-in per machine.** Rejected. Moving between a shared relay and a local one meant a new device approval each time.
- **Named profiles (`--profile`).** Deferred. The relay already names a sign-in. A profile earns its place when one relay holds two accounts, or when agent configurations differ per account.
- **An active relay, like `gh auth switch`.** Rejected for the reason above.
- **One daemon process for every sign-in.** Deferred. The connect, refresh, and retry loop is per relay, and one relay rejecting its credentials should not stop the others.
