---
name: use-vishot
description: Capture deterministic screenshots with Vishot and return a manifest of the images. Use for inspecting a UI, documenting a surface, producing visual-comparison inputs, or any screenshot task — including a pull request's before/after pair. Delegates the runtime-specific behaviour to `use-vishot-with-web`. Reads an existing session when a page needs one.
---

# use-vishot

Vishot is the screenshot interface: Playwright under a CLI, with a fixed output shape. Reach for it before writing ad-hoc browser automation, and before reaching for the `capture.ts` harness — which exists for the one thing Vishot cannot do (see below).

Use this for any screenshot task. The pull request workflow that needs a before/after pair is `create-pr`; it calls this skill for the images and owns everything after them.

## Workflow

1. Identify every surface and state asked for: route, viewport, theme, locale, fixture data, and the interaction needed to reach it.
2. Reuse what the repository already exposes — a route, a stable selector, a seeded session — before writing new automation. Relay pages are routes of a running relay, so "the state" is usually a route plus the data behind it.
3. Choose the runtime. In this repository that is always `use-vishot-with-web`, since the surfaces are browser routes. There is no Electron window and no Capacitor shell here.
4. Make sure a relay is running and that the page is reachable. Vishot renders a URL; it does not start the application. `apps/relay/capture/README.md` covers starting one, and `pnpm --filter @mukae/relay capture --label <name>` starts one for a before/after pair.
5. Give it an explicit output directory and a viewport. Never rely on the defaults: they are 1600x1200 at device scale factor 2, which is neither of the sizes this project designs for.
6. Inspect every image before using it. Reject a blank page, a loading skeleton, an error page, a sign-in redirect, or an unstyled page unless that is the state asked for.
7. Return a manifest rather than a directory listing:

   ```text
   id: dashboard-devices
   title: Dashboard / devices
   runtime: web
   viewport: 1440x900
   image: /absolute/path/dashboard-devices.png
   ```

   When a capture cannot complete, return the reason instead of a path. Do not invent pull request, revision, upload, or storage policy — the calling workflow owns those.

## The session limit

`vishot render` builds its own browser context and accepts no cookie, `storageState`, or header. So it can capture the pages that need no sign-in (`/sign-in`, `/device`) directly, and nothing behind the session — `/` redirects to the sign-in page, and the result looks like a successful capture of the dashboard.

Measured, not assumed: `vishot render` on `/` while signed out produces a PNG byte-identical to the one it produces on `/sign-in`.

When a page needs the session, do not weaken the capture to avoid the problem, and do not report the limit before trying. Two ways through:

- **Capture the page with a signed-in browser instead**: `apps/relay/capture/capture.ts` seeds a session and sets the cookie, which is why it exists alongside this skill. Use it when the state is behind the session.
- **Render a scene app**: `vishot render --target browser <vite-dir>` against a Vite app that exposes capture roots. Product-owned scenario automation belongs in the repository; add one only when a state needs it and is worth keeping.

Whichever you pick, say which was used and which states could not be captured.

## Capture contract

- Use stable IDs and human-readable titles.
- Leave `--name` off when the URL already gives a meaningful name; pass it when two states share a route (`/` signed in and signed out) or the derived name is wrong.

  The derived name is the last path segment, or `home` for the root — so a surface's name tells you nothing about the state it shows. Pass `--name` for anything state-dependent rather than trusting the default.
- Treat `--settle-ms` as a final rendering delay, not as a substitute for a readiness condition. Prefer a selector that only appears once the page has settled; the relay dashboard loads its data after the document, so its heading alone captures a spinner.
- Keep locale, theme, data, viewport, and readiness conditions fixed across captures that will be compared.
- Vishot writes what it renders; it is not a comparison tool. It stores no baseline and diffs nothing. Judging the pair is `create-pr`'s job.
