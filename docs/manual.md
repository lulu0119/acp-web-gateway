# Manual

Device setup and relay operation. Web app integration lives with the SDK in [`packages/sdk/README.md`](../packages/sdk/README.md).

## Start the relay

Start Exterior with GitHub OAuth credentials. See `apps/relay/.env.example`. From a checkout, `pnpm relay` listens on `127.0.0.1:8787`.

## Sign in a device with the CLI

Install the preview CLI and sign it in:

```bash
npx --package=https://pkg.pr.new/lulu0119/exterior@main -- exterior login
npx --package=https://pkg.pr.new/lulu0119/exterior@main -- exterior agent-config create --agent-type opencode
npx --package=https://pkg.pr.new/lulu0119/exterior@main -- exterior daemon
```

`@main` is the latest preview published from `main`. npx caches a package by its address and keeps running the first `@main` it downloaded, so use a commit hash, such as `@0b26097`, to get a newer publish. The package is one bundled file with no dependencies. From a checkout, the same commands are `node packages/gateway/dist/bin/exterior.mjs`.

`login` prints a link with the code filled in. Approve that code on Exterior after signing in with GitHub. `daemon` keeps an outbound connection. It starts agents in the working directory and reports it, so a web app has a real working directory on the device to send when the person has not chosen one.

That directory is `~/.local/share/exterior/workspace` until one is chosen:

```bash
exterior config show                                  # what sessions work in now
exterior config set --working-directory ~/Projects    # choose one; it is created
exterior config set --default                         # go back to the device's own
```

A running daemon picks the change up and opens later sessions there; sessions already open keep the directory they started in. A directory that cannot be created is refused where it is set, with the system's own reason.

`exterior --help` and `exterior <command> --help` describe each command. A running daemon picks up a changed configuration file and tells the relay; sessions already open keep their agent. A daemon with no configurations stays connected and offers none until one is added.

## Desktop app

On a desktop, the Exterior app does the same without a terminal. It sits in the tray, starts at login, and runs one daemon for each relay the device is signed in to, starting it again if it stops. Its window signs in to relays and adds or removes agents, and Settings chooses the directory sessions work in with the system's folder picker. Quitting the app stops the daemons, so the device goes offline. Download it from the [latest release](https://github.com/lulu0119/exterior/releases/latest); the relay's Add device offers the file for the computer it is opened on. The app is not signed yet, so macOS and Windows ask once before opening it.

## Linux server without a desktop

Run the daemon under a systemd user unit, such as `~/.config/systemd/user/exterior.service`:

```ini
[Unit]
Description=Exterior daemon

[Service]
ExecStart=%h/.local/bin/exterior daemon --relay relay.example.com
Restart=on-failure
RestartSec=5
# 3: the relay rejected the sign-in, so run exterior login again first.
RestartPreventExitStatus=3

[Install]
WantedBy=default.target
```

Then `systemctl --user enable --now exterior`. A user unit runs while you are logged in; `loginctl enable-linger` keeps it running without a login.

## Relay addresses

`login --relay <url>` chooses a relay explicitly. A bare host such as `relay.example.com` means https. A device keeps one sign-in per relay in `~/.config/exterior/sign-ins/`, and can be signed in to several relays. The first time it signs in to a relay, the device makes a key for that relay and keeps it in `~/.config/exterior/devices/`; every token it gets there is bound to the key, and the key's thumbprint is its device id. `logout` revokes the sign-in on the relay and keeps the key, so signing in again lists the same device. Removing the device on the dashboard signs it out too: its daemon stops and asks to sign in again, and signing in again brings it back. Deleting the key file makes the computer a new device. `daemon` and `logout` act on the only sign-in, or on the one named with `--relay` or `EXTERIOR_RELAY`; with several and none named, they list the choices and stop. One daemon serves one relay, so serving two relays takes two daemons. `status` lists the sign-ins and what each one's daemon last reported: connected, retrying, or stopped and why. A daemon writes that to `~/.local/state/exterior/daemons/`, and `status --json` prints it for the desktop app.

## Previews and Example deploys

Maintainer detail, defined by the workflows: [preview.yml](../.github/workflows/preview.yml) publishes `exterior` and `@exterioragentprotocol/sdk` from `main` via pkg-pr-new; [example-pages.yml](../.github/workflows/example-pages.yml) publishes Example to GitHub Pages. Example bakes `VITE_EXTERIOR_URL` in at build time, so a new address needs a rerun.

## Daemon behavior

The daemon checks its saved credentials before each connection attempt and refreshes an access token within one minute of expiry. An established connection stays open; token expiry is handled when reconnecting. Each running agent has its own socket to the relay, so agents keep running while the daemon reconnects. If the relay responds with HTTP 401, the daemon forces one refresh and tries again. Temporary connection or refresh failures retry with delays from one to thirty seconds. Rejected refresh credentials, a second 401 after refresh, or an HTTP 403 for a token that is not a device's stop the daemon with instructions to sign in again.
