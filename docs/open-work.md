# Open work

Current roadmap. Decisions: [adr/](./adr/). How agents maintain docs: [../AGENTS.md](../AGENTS.md).

## Not implemented

Code still missing.

- `agent-config check` and `agent-config remove`: the CLI cannot undo a configuration, and a broken one is only found when a connection opens. Check with an ACP `initialize` before writing.
- Two accounts on one relay from one device: a sign-in is keyed by relay only, and the token from device sign-in carries no account name to tell two apart.
- `logout` deletes the local sign-in and does not revoke its refresh token on the relay.
- Consent identity: the relay fetches each app's icon itself (blocking private addresses, re-encoding to PNG) and serves it; apps not on the public internet send a data URI in the approval request. Until then the consent page and authorized apps show a monogram. See `docs/research/2026-10-13-oauth-consent.md`.
- Pending approvals are unauthenticated and name themselves: rate-limit `POST /api/authorize-request`, reuse one client per app origin instead of one per sign-in, and decide what "verified" means.
- Scope redesign: separate a daemon scope from what web apps ask for (list devices, open agents), and let the person pick devices or agents at consent. Rename `machines` on the wire to devices in the same change.
- Check `Origin` against the app's redirect origins on the web app API and on `/api/acp`, instead of `Access-Control-Allow-Origin: *`.
- Removing a device from the dashboard: it needs to revoke that device's refresh token, which the relay cannot yet map to a device id.
- The device approval page shows only the code. Show the requesting device's name and address so a forwarded code is easier to spot.
- npm release of `exterior-project`, `@exterior/contract`, and `@exterior/client`: when the product is ready. Until then, install from the preview published by `.github/workflows/preview.yml`. A checkout still runs `node packages/gateway/dist/bin/exterior.mjs`.
- Finish the Exterior rename outside code: update the Coolify application name and the GitHub OAuth app name. The GitHub repo is already [lulu0119/exterior](https://github.com/lulu0119/exterior).

## Awaiting verification

Code exists and has not been verified yet. Delete the bullet once it passes.

- Sign in with GitHub on Exterior, return to Example, see a device running `exterior daemon`, and open a live ACP session.
- Sidebar sessions per working directory: create, select, and delete a session with a real ACP agent, and check that a session created in one directory keeps that directory after reload.
- A Windows device through the relay: open OpenCode and an `npx` agent from Example without choosing a directory, and check the session runs in `~/.config/exterior/workspace`. The launch, `session/new`, and stop were checked against the real agents without the relay.
