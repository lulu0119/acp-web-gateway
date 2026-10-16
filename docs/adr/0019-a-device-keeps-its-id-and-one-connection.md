# A device keeps its id through signing out, and is online once

The relay lists a device by the id its daemon announces. When that id lived in the sign-in, signing out and in again, from the terminal or the desktop app, listed the same computer a second time, offline and with no way to remove it. A daemon that reconnected before the relay noticed its old socket die also showed up twice, once per connection. A device now keeps one id per relay in its own file, and signing out removes only the credentials. When a connection announces a device id another connection of the same account holds, the newer one takes over and the relay closes the older socket with code 4001. A daemon closed that way waits the longest retry before it connects again, so two computers that share one id because a configuration was copied take turns slowly instead of every second. The relay and the daemon each ping the other and end a socket that does not answer, so a vanished device goes offline and a daemon whose socket died connects again.

## Considered Options

- **Signing out leaves the account.** Rejected. Signing out would have to remove the device on the relay too, which fails while the relay is unreachable and leaves the same stale row. Web apps that are later granted particular devices would lose them on every sign-in. Removing a device from the account is its own action on the dashboard.
- **One device id for the whole computer, shared by every relay.** Rejected. Separate relays have no reason to learn that they reach the same computer, and the id is already per relay.
- **Merging rows by hostname.** Rejected. Two computers can share a hostname, and a hostname changes.

## Consequences

- A device id another account already holds on the relay is refused. Sign-in then gives this account a new id, so a computer handed from one person to another on the same relay becomes a second device instead of taking over the first.
- The close code is wire contract between the relay and the daemon.
