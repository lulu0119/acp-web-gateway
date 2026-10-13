---
name: use-vishot-with-web
description: Render browser routes with Vishot. Use when the surface is a locally running web app or relay page — the capture side of `use-vishot`, covering direct URL capture, the scene-app form, viewports, readiness, and how to reach a state that needs a session.
---

# use-vishot-with-web

Prefer a route the running app already serves. Reach for a scene app only when a state needs interaction Vishot's direct capture cannot perform, and a signed-in browser only when the page is behind a session.

## Run it

Run it from `apps/relay`, so `--output-dir` resolves where you expect:

```sh
cd apps/relay
pnpm exec vishot render \
  --target browser \
  http://127.0.0.1:8891/sign-in \
  --width 1440 --height 900 \
  --settle-ms 2000 \
  --output-dir ../../.captures/vishot
```

`pnpm --filter @mukae/relay exec` also works, but it runs with the package directory as the working directory, so a relative `--output-dir` lands under `apps/relay/` and the command still exits 0. Pass an absolute `--output-dir` if you use the filter form.

Options: `--target browser`, `--output-dir`, `--name`, `--width`, `--height`, `--settle-ms`, `--full-page`, `--root <name>` (repeatable).

The relay must already be running. In this repository, capture from the **built** relay: the account pages render server-side from `dist/public/.vite/manifest.json`, so a dev-server capture does not prove what the production page looks like. For a before/after pair, `pnpm --filter @mukae/relay capture --label <name>` starts its own relay, captures, and stops it; start a relay yourself when you want to render against one directly.

## Direct URL capture

It loads the URL, waits for readiness, applies `--settle-ms`, and screenshots the viewport. It does not click or navigate: a state that needs an interaction is not reachable this way.

Three things the defaults will get wrong if you let them:

- **Viewport.** The default is 1600x1200. This project designs for 1440x900 and 390x844, so pass `--width` and `--height` on every call.
- **Device scale factor.** Fixed at 2, so `--width 1440` writes a 2880-pixel-wide PNG. That matches the `capture.ts` harness, which sets the same factor; do not mix captures from a tool that uses 1.
- **Name.** Derived from the URL: the last path segment, or `home` for the root. Two states of `/` therefore collide, and the name says nothing about the state. Pass `--name` for anything state-dependent.

## Readiness

The two forms wait on different things, and the difference decides which one can hang.

**Direct URL capture** loads the document, applies `--settle-ms`, and screenshots. It never waits for a page-owned signal, so it always produces an image — which is exactly why it can produce the wrong one. The dashboard fetches its data after the document, so a capture taken on `domcontentloaded` plus a fixed delay can photograph a spinner. `--settle-ms` is a delay, not proof: inspect the image and confirm it shows the state you asked for, and raise the value or move to a form you control when it does not.

**Scene-app capture** waits for a page-owned signal before it captures anything:

```js
import { markScenarioReady } from '@vishot/core'

markScenarioReady()
```

Measured: a scene app that exposes a capture root but never calls `markScenarioReady()` produces **no artifact at all**, and fails after `page.waitForFunction: Timeout 30000ms exceeded`. The CLI takes no timeout flag, so the wait is Playwright's 30-second default. Call `markScenarioReady()` once the scene is ready and stable — not from the module's first line, which is before the state exists.

That signal is also what makes a scene app the honest form for an unstable state: it is the only way to tell Vishot what "settled" means for a page.

## Scene apps

For states that need interaction, or capture roots to export a DOM region instead of a viewport:

```sh
pnpm --filter @mukae/relay exec vishot render --target browser <scene-app-dir> --output-dir .captures/vishot --root hero
```

A capture root is an element marked for export, and Vishot writes one artifact per root:

```html
<div data-scenario-capture-root="hero">…</div>
```

With no `--root`, every root on the page is exported, named by its attribute. Root names must be unique on the page, and artifact paths must not collide.

Vishot starts its own Vite server for the scene-app form, so a scene app is a Vite app in this repository that renders the state and calls `markScenarioReady()` when it is stable. No scene app exists here yet; add one only for a state worth keeping, and keep it under the repository's ownership rather than in a scratch directory.

## Reaching a signed-in state

Direct capture builds its own context with no cookie, `storageState`, or header, so a page behind the session renders as a redirect. Signing in through the UI is not an option either — GitHub is the only sign-in.

Capture those pages with `apps/relay/capture/capture.ts`, which seeds a session and sets the cookie, then treat Vishot as the tool for the unsigned pages and the scene-app form. If you need Vishot itself for a signed-in route, drive its library (`captureBrowserPage` from `@vishot/renderer-browser`) from a script that supplies its own browser context — the CLI cannot pass one.

## Constraints

- Keep the target local. Do not capture an untrusted remote page.
- Keep the state deterministic: seeded data, a fixed viewport, a fixed theme, and no animation mid-flight. Vishot disables animations in the screenshot, but a load in progress is still a load in progress.
- Readiness conditions belong to the product, not to production CSS: never change app styling to satisfy a capture.
- Vishot is not a diff tool. It writes images; comparing them belongs to the workflow that asked for them.
