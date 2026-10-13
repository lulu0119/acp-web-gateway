---
name: use-vishot
description: Capture a local browser page with Vishot. Use for a screenshot or a comparison image of a web route.
---

# use-vishot

Vishot screenshots a URL or a scene app. Reach for it before writing ad-hoc browser automation. A pull request's before/after pair belongs to `create-pr`.

## Signed-in pages

`vishot render` builds its own browser and accepts no cookie. A page that renders only after the account is signed in comes back as the sign-in page, and the command exits 0. Use `apps/relay/capture/capture.ts` for that page, with `--surface` naming it.

## A URL

The app is already running. Capture the built app when the page is served from the build. Run from the package that depends on Vishot, or pass an absolute `--output-dir`. A relative output directory is resolved from that package, and the command still exits 0.

```sh
pnpm exec vishot render \
  --target browser \
  <url> \
  --width <px> --height <px> \
  --settle-ms <ms> \
  --output-dir <dir>
```

Pass width and height. The default viewport is not a size this project uses. A pair uses the same size on both sides. `--settle-ms` is a delay after load, not proof the page has its data. The command does not click or navigate. Open the image. A blank page, a spinner, or the sign-in page where another page was asked for is a failed capture.

## A state that needs a click

Render a scene app directory instead of a URL. Mark the region to export, and call `markScenarioReady()` once that region is stable. Without that call, Vishot writes no image.

```html
<div data-scenario-capture-root="hero">…</div>
```

```js
import { markScenarioReady } from '@vishot/core'

markScenarioReady()
```

Pass `--root <name>` to export one region. Root names on the page are unique.

## Return

Return a manifest, or the reason the capture failed:

```text
id: <page>
title: <page, state>
viewport: <width>x<height>
image: <absolute path>
```

Keep the target local. Keep data and viewport the same across images that will be compared. Vishot writes the image. Comparing it belongs to the caller.
