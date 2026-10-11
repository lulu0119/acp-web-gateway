# The local gateway speaks HTTPS

Status: superseded by [ADR 0008](0008-account-relay.md)

Safari blocks an HTTPS page from calling `http://127.0.0.1` or `ws://127.0.0.1`. The status check fails immediately, so every click looks like a free port and the Connect button stays disabled until the wait expires. Chromium allows that loopback request, which is why one window can connect while Safari windows cannot.

The gateway listens with a certificate for `127.0.0.1` that is not a certificate authority. Install adds that certificate to the login keychain. The page then uses `https://127.0.0.1` and `wss://127.0.0.1`.

## Considered Options

- **Keep using HTTP.** Works in Chromium. Safari never observes the gateway.
- **Trust a local certificate authority.** The private key could sign names other than loopback.
- **Move the page itself onto `http://127.0.0.1`.** The public page would only be a launcher, and the open session would leave the site the person started on.
