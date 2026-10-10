# Local gateway uses a custom scheme

Status: accepted

The first version is a local gateway. The browser prompt that opens the registered local program is the only human confirmation. There is no third-party login. The web app does not receive the name of a configuration stored on the machine.

## Considered Options

- **A public OAuth gateway.** Rejected for this version. A later remote relay may use an account to bind a person to a machine.
- **A second confirmation page on the machine.** Rejected. The browser prompt is the confirmation.
- **Pairing a remote account now.** Rejected. That relay is not this version.
