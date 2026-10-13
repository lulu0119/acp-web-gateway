# Visual evidence

How to get a comparable before/after pair for a relay or web app surface. This repository has no visual test runner: the surfaces are routes of a running relay, and `apps/relay/capture/capture.ts` is the harness that captures them. Its output is a handoff artifact for one pull request, not a baseline the repository keeps.

Follow this when the diff moves anything a person sees: layout, hierarchy, copy on a page, a state (empty, loading, error, offline), a viewport, a theme. A copy tweak inside one line of a component still counts, because the reviewer cannot otherwise tell where the pixels moved. Skip it for changes with no rendered surface.

## Which capture tool

Two exist, and this is the part worth getting right.

- **`apps/relay/capture/capture.ts`** — for any page behind the session, which is most of them, including the dashboard and every surface whose state depends on account data. It seeds a session and sets the cookie itself.
- **`use-vishot`** — for a page that needs no sign-in (`/sign-in`, `/device`), and for the scene-app form when a state needs interaction. It is the general screenshot tool; reach for it when the session is not the problem.

The split is forced, not a preference. Vishot renders a URL in a context it builds itself, with no cookie, `storageState`, or header — so a signed-out capture of `/` returns the sign-in page, and it looks like a successful capture. Measured: `vishot render` on `/` while signed out produced a PNG byte-identical to one for `/sign-in`. Use the harness wherever the page would otherwise redirect.

Both are described in `use-vishot-with-web` — the URL form, viewports, readiness, and the scene-app form.

## The pair

| | Before | After |
| --- | --- | --- |
| Source | `git worktree add <path> <merge-base>` | the contributor's worktree, unchanged |
| Port | 8799, and `BETTER_AUTH_URL` set to it | 8891 (a default relay may already hold 8787) |
| Data | the harness's fixtures | the harness's fixtures |
| Browser | 1440x900, then 390x844 | the same two viewports |

Never check out or reset the contributor's worktree to reach the base commit. Take a detached worktree of the merge base, capture there, and leave the active branch alone.

## Running the harness

It starts its own relay, so nothing has to be running first — except a build:

```sh
# in the worktree being captured, from the repository root
pnpm install
pnpm build                     # the relay alone fails without @mukae/contract built first
node --experimental-strip-types apps/relay/capture/capture.ts --label before --port 8799

# in the contributor's worktree
node --experimental-strip-types apps/relay/capture/capture.ts --label after --port 8891
```

Options: `--label before|after` (required; names the output directory), `--port` (default 8799), `--viewport 1440x900`, `--out <dir>` (default `.captures/`). Run it twice with two `--viewport` values to cover the wide and narrow layouts, or once per viewport in a loop — the file name carries the viewport, so both runs land side by side.

It writes one PNG per surface into `.captures/<label>/`, named `<surface>-<viewport>.png`. Upload those with the `upload-github-attachment` skill, then remove the base worktree.

On Windows, `git worktree remove --force` can deregister the worktree and then fail to delete the directory, leaving an orphan under `node_modules`. Check that it is gone (`ls <path>`, `git worktree list`) and delete what remains, rather than assuming the command cleaned up.

## What it does for you

The parts of a capture that a person forgets, and the reasons it is a script instead of instructions:

- **Signs in.** A page captured signed out is not the page under review. It seeds a session and sets the session cookie.
- **Fixtures the data.** One account, four devices — two connected with agents, one gone 43 minutes, one gone nine days — so the pair exercises the connected and the offline branches of the same row, at a volume where hierarchy is visible.
- **Connects real daemons.** The two online fixtures announce themselves over the daemon socket through the relay's own device-code flow. Without this, the dashboard renders every device as "Shown when online" and the agents column — the part most changes touch — is never in the picture.
- **Waits for the state, not a timer.** Each surface declares the condition that only holds once it has settled, and the capture waits for fonts too.
- **Holds the frame fixed.** Same viewport, device scale factor 2, reduced motion, and animations disabled, so an "after" differs from its "before" only where the code changed.

The fixtures live in `capture.ts` as `fixtureDevices` and `surfaces`. A new page needs an entry in `surfaces` with a ready condition that also holds in the base revision being compared against; a change to what the dashboard shows at realistic volume may need a fixture change. Keep the ready condition honest: waiting for the fix itself means the before capture never completes.

## Surfaces it captures

| Surface | Route | Rendered by |
| --- | --- | --- |
| Dashboard | `/` | the browser, from `/api/dashboard` |
| Sign-in | `/sign-in` | the server |
| Device code entry | `/device` | the server |

Not captured yet: device approval (`/device?user_code=…`), consent (`/consent`), and the dashboard's dialogs and error states. Add them to `surfaces` when a change touches them, and say in the pull request which states were and were not captured.

Account pages render server-side, so a change under `apps/relay/src/web` is invisible until the relay is rebuilt. The harness serves the built relay (`dist/public`); a dev server would not prove the production page changed.

## Inspecting and pairing

1. Open every image. A blank page, a loading skeleton, an error page, a sign-in redirect, or an unstyled page is not a pair — it is a capture failure, and it stops the pull request body until it is redone.
2. Confirm both sides show the same surface, state, viewport, theme, locale, and fixture data. An "after" at 390x844 against a "before" at 1440x900 shows nothing.
3. Keep one record per pair for the handoff:

   ```text
   id: dashboard-devices
   title: Dashboard / devices
   route: /
   viewport: 1440x900
   data: 4 devices (2 connected with agents, 1 gone 43m, 1 gone 9d)
   before: /abs/base-worktree/.captures/before/dashboard-1440x900.png
   after: /abs/worktree/.captures/after/dashboard-1440x900.png
   ```

   Use `before: absent` for a surface the change adds and `after: removed` for one it deletes.
4. Capture both viewports when the change touches layout — hierarchy often breaks in only one.
5. Upload each file with the `upload-github-attachment` skill, keeping the argument order aligned with the pair record, then remove the base worktree.

A capture that cannot be made — the base revision does not build, the surface needs a real GitHub sign-in — is reported as an unverified state in the pull request body with the reason, never quietly dropped from `## Visual changes`.
