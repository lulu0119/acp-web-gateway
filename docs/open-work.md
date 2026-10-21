# Open work

Current roadmap. Decisions: [adr/](./adr/). How agents maintain docs: [../AGENTS.md](../AGENTS.md).

## Not implemented

Code still missing.

- `agent-config check`: a broken configuration is only found when a connection opens. Check with an ACP `initialize` before writing.
- Installing `exterior` beyond the release files ([ADR 0017](adr/0017-the-daemon-ships-as-one-executable.md)): strip the Linux Node before injecting, then `install.sh`, a Homebrew tap formula, a Scoop bucket, and winget. Then the setup guide's assistant and terminal steps install the executable instead of using `npx`, so the device needs no Node.
- Signing: an Apple Developer ID to sign and notarize the macOS app, and a Windows code-signing certificate. Until then, the desktop app is for testers.
- Two accounts on one relay from one device: a sign-in is keyed by relay only, and the token from device sign-in carries no account name to tell two apart.
- Unauthenticated endpoints that add rows: rate-limit `POST /api/auth/oauth2/register` and the metadata-document fetch, and decide what "verified" means beyond the redirect host the pages show.
- Exterior Agent Protocol v1 ([spec](protocol/exterior-agent-protocol.md)): connections, device messages, close codes and error codes follow the spec. Missing: the discovery documents and the `/eap/` endpoints they name, the `eap:client` and `eap:device` scopes, one OAuth client per device with the device id read from the token instead of `hello`, and closing the sockets of a narrowed grant or a revoked client. better-auth registers a device-code client per device (RFC 7591) and puts that client in the token's `azp`, but stores every registered scope on every self-registered client: the relay has to tie `eap:device` to the device-code grant at registration, at `/device/code` and at authorization, and bind a device client to the first account that approves it.
- Check `Origin` against the app's redirect origins on the web app API and on `/api/acp`, instead of `Access-Control-Allow-Origin: *`.
- The device approval page shows only the code. Show the requesting device's name and address so a forwarded code is easier to spot.
- npm release of `exterior-project` and `@exterioragentprotocol/sdk`: when the product is ready. Until then, install from the preview published by `.github/workflows/preview.yml`. A checkout still runs `node packages/gateway/dist/bin/exterior.mjs`.
- Finish the Exterior rename outside code: update the Coolify application name and the GitHub OAuth app name. The GitHub repo is already [lulu0119/exterior](https://github.com/lulu0119/exterior).

## Awaiting verification

Code exists and has not been verified yet. Delete the bullet once it passes.

- The first release: a tag drafts it with every file the setup guide links to, and the downloads install on macOS, Linux, and Windows on Arm. A pull request run built the files without the tag.
- The desktop app on Linux: the tray, start at login, and the window as the app when GNOME shows no tray.
- The systemd user unit in the README, on a Linux server.
- Removing a device and `logout` against the hosted relay: a removed device's daemon stops with sign in again, the desktop app shows Sign in, and signing in again lists the device under the same id. `logout` revokes the refresh token there.
- Heartbeats through the hosted relay behind Coolify: a device that loses its network goes offline on the dashboard within a minute, and a daemon whose socket died without closing connects again and is listed once.
- An agent configuration added while the daemon runs shows on the dashboard and in Example without a restart. The daemon logged the change against the live relay; the pages were not checked.
- Example on GitHub Pages: sign in against the relay from `VITE_EXTERIOR_URL` and land back on the Pages URL.
- Sign in with GitHub on Exterior, return to Example, choose an agent on a device running `exterior daemon`, and start a live conversation. Verify tool calls and approvals with the real agent.
- Sidebar sessions per working directory: create, select, and delete a session with a real ACP agent, and check that a session created in one directory keeps that directory after reload.
- A Windows device through the relay: open OpenCode and an `npx` agent from Example without choosing a directory, and check the session runs in the device's own directory. The launch, `session/new`, and stop were checked against the real agents without the relay.
- The folder dialog on a real window: choose a directory in the desktop app's Settings and see it in `exterior config show`, and check a cancelled dialog changes nothing.
- `agent-config` and a broken entry in the configuration file: one entry the parser cannot read makes `remove` refuse the whole file, including removing a different, good entry, and nothing in the CLI can repair it.
