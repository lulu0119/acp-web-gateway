# Product notes

Facts the audit needs that the code does not state. Domain terms follow the root `CONTEXT.md`; this file does not redefine them. Update it when an audit finds it wrong.

## Who uses the relay pages

Two people, often the same one:

- **The account holder.** Signs in with GitHub, approves a machine with a code its CLI printed, approves a web app that asks for access, and checks what is online. Often sent here by an AI assistant running on the machine, mid-task.
- **The developer** of a web app. Reads the setup instructions, runs the CLI, and wires `@exterior/client` into an app.

Each relay page interrupts another task. The person arrives from a terminal or a web app and must leave knowing whether it worked and where to go back to.

## Class and comparables

An account console with OAuth consent and device approval. Compare with:

- **GitHub device activation** (`github.com/login/device`): a segmented code field, the signed-in account shown, a warning about codes sent by others.
- **Cloudflare / Google OAuth consent**: both parties' icons, the app's name and origin, a publisher or verification hint, permissions grouped by what they allow, the account being granted, then Authorize and Cancel.
- **Tailscale Machines**: one row per device with name, owner, address, version, and last seen; an "Add device" action at the top of the list; a per-row menu.

Capabilities this class usually has: a code field that accepts paste and shows grouping, a clear success state with the next step, a retry or restart path after an expired link, devices listed even while offline with last seen, a revoke or remove action per row.

## Surfaces and their main questions

| Surface | Main question |
| --- | --- |
| Sign in (`/sign-in`) | "Where am I, and how do I continue?" |
| Device code entry (`/device`) | "Where do I type the code my machine printed?" |
| Device approval (`/device?user_code=…`) | "Is this the device I just started, and what does approving let it do?" |
| Consent (`/consent`) | "Which app, running where, wants what, from which account, and is it safe to allow?" |
| Result pages (approved, denied, error) | "Did it work, and what do I do now?" |
| Dashboard (`/`) | "Which of my devices are reachable, what runs on them, and which apps can reach them?" Secondary: connect another device. |
| Example web app | "Can I reach an agent on my device from here, and is it working?" |

## Core objects

| Object | Created by | On the relay pages |
| --- | --- | --- |
| Account | GitHub sign-in | The signed-in person. |
| Device | `exterior login` with a device code | Approved on `/device`; listed on the dashboard from sign-in on, online while its daemon is connected. |
| Web app (OAuth client) | Registration, or a pending request from `@exterior/client` | Approved on `/consent`; listed under authorized apps; revocable. |
| Connection | A web app opening an agent | Counted on the dashboard. |
