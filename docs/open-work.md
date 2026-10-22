# Open work

Current roadmap. Decisions: [adr/](./adr/). How agents maintain docs: [../AGENTS.md](../AGENTS.md).

## Not implemented

Code still missing.

- `agent-config check`: a broken configuration is only found when a connection opens. Check with an ACP `initialize` before writing.
- Installing `exterior` beyond the release files ([ADR 0017](adr/0017-the-daemon-ships-as-one-executable.md)): strip the Linux Node before injecting, then `install.sh`, a Homebrew tap formula, a Scoop bucket, and winget. Then the setup guide's assistant and terminal steps install the executable instead of using `npx`, so the device needs no Node.
- Signing: an Apple Developer ID to sign and notarize the macOS app, and a Windows code-signing certificate. Until then, the desktop app is for testers.
- Two accounts on one relay from one device: a sign-in is keyed by relay only, and the token from device sign-in carries no account name to tell two apart.
- The metadata-document fetch is unauthenticated: rate-limit it.
- A dashboard form to register a client: `POST /api/clients/register` exists, but no page offers it, so an app with nowhere to publish a metadata document has no way in ([ADR 0028](adr/0028-a-web-app-names-itself.md)).
- Grants per device: the consent page grants every device of the account. Let the person choose devices, and close the attach sockets a narrowed grant no longer covers ([spec §4.4](protocol/exterior-agent-protocol.md#44-grants)).
- The device approval page shows the code and the account. Show the requesting device's name and address too, so a forwarded code is easier to spot.
- A machine-readable EAP schema and a conformance suite a third-party relay or device can run.
- npm release of `exterior-project` and `@exterioragentprotocol/sdk`: when the product is ready. Until then, install from the preview published by `.github/workflows/preview.yml`. A checkout still runs `node packages/gateway/dist/bin/exterior.mjs`.
- Finish the Exterior rename outside code: update the Coolify application name and the GitHub OAuth app name. The GitHub repo is already [lulu0119/exterior](https://github.com/lulu0119/exterior).

## Awaiting verification

Code exists and has not been verified yet. Delete the bullet once it passes.

- The first release: a tag drafts it with every file the setup guide links to, and the downloads install on macOS, Linux, and Windows on Arm. A pull request run built the files without the tag.
- The desktop app on Linux: the tray, start at login, and the window as the app when GNOME shows no tray.
- The systemd user unit in the README, on a Linux server.
- EAP v1 against the hosted relay: a device signs in with its key through Exterior's metadata document, which Example's Pages site must serve at `https://lulu0119.github.io/exterior/device-client.json` for any other relay, beside Example's own `oauth-client.json` with its loopback redirect; `pnpm example` signs in as Example; Example opens an agent through the agent socket; a dropped device socket leaves the agent running; removing the device stops its daemon with sign in again, and signing in again brings it back; `logout` revokes the refresh token. The hosted relay and the installed daemons have to move to v1 together.
- Heartbeats through the hosted relay behind Coolify: a device that loses its network goes offline on the dashboard within a minute, and a daemon whose socket died without closing connects again and is listed once.
- An agent configuration added while the daemon runs shows on the dashboard and in Example without a restart. The daemon logged the change against the live relay; the pages were not checked.
- Example on GitHub Pages: sign in against the relay from `VITE_EXTERIOR_URL` and land back on the Pages URL.
- Sign in with GitHub on Exterior, return to Example, choose an agent on a device running `exterior daemon`, and start a live conversation. Verify tool calls and approvals with the real agent.
- Sidebar sessions per working directory: create, select, and delete a session with a real ACP agent, and check that a session created in one directory keeps that directory after reload.
- A Windows device through the relay: open OpenCode and an `npx` agent from Example without choosing a directory, and check the session runs in the device's own directory. The launch, `session/new`, and stop were checked against the real agents without the relay.
- The folder dialog on a real window: choose a directory in the desktop app's Settings and see it in `exterior config show`, and check a cancelled dialog changes nothing.
- `agent-config` and a broken entry in the configuration file: one entry the parser cannot read makes `remove` refuse the whole file, including removing a different, good entry, and nothing in the CLI can repair it.
