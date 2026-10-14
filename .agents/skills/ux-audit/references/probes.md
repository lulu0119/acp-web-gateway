# Probes

How to get L2 and L3 evidence for the relay pages.

## Run it

```sh
cp apps/relay/.env.example apps/relay/.env   # set BETTER_AUTH_SECRET; GitHub keys only for real sign-in
pnpm relay                                   # builds and serves http://127.0.0.1:8787
```

For UI work, run `pnpm --filter @exterior/relay web` beside the relay and set `WEB_DEV_SERVER_URL=http://127.0.0.1:47102` in `.env`; the relay then loads styles and scripts from Vite.

Signing in needs GitHub. Without it, seed a session: open the relay's SQLite file (`apps/relay/data/relay.sqlite`) through `openExteriorAuth` in a scratch script, create a user and a session with `context.internalAdapter`, and send the session token as the `better-auth.session_token` cookie (signed with the secret, the same way `apps/relay/src/server/routes/dashboard.test.ts` does). Start a daemon with `node packages/gateway/dist/bin/exterior.mjs daemon --relay http://127.0.0.1:8787` to populate the dashboard.

Setup traps:

- **Ports.** 8787 and 47102 are fixed in `.env` and `vite.config.ts`; stop only processes you started.
- **Dev CSS.** The Vite dev server generates CSS on demand; check a missing utility against `pnpm --filter @exterior/relay build` output, not the dev stylesheet.
- **Account pages render on the server.** A change in `apps/relay/src/web/pages/account.tsx` needs the relay restarted (or rebuilt) before it shows.

Record the viewport (for example 1440×900 and 390×844) and the data (machines, apps) in the report.

## Hierarchy probe (`no-flat-hierarchy`)

Run in the page. It reports the share of visible text per font size and weight.

```js
(() => {
  const W = innerWidth, H = innerHeight, sizes = {}
  let total = 0
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('')
    if (!text) continue
    const r = el.getBoundingClientRect()
    if (!r.width || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    const key = `${cs.fontSize} ${cs.fontWeight}`
    sizes[key] = (sizes[key] ?? 0) + text.length
    total += text.length
  }
  return Object.entries(sizes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${Math.round(v / total * 100)}%`)
})()
```

Read the result against the rule and pair the numbers with a screenshot you opened.

## Affordance probe (`no-false-feedback`)

Run in the page. It lists clickable elements that do not show a pointer cursor.

```js
[...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="menuitem"], summary, label[for]')]
  .filter(el => !el.matches(':disabled') && getComputedStyle(el).cursor !== 'pointer')
  .map(el => el.outerHTML.slice(0, 120))
```

Then click each action that sends a request with the network throttled (DevTools "Slow 3G", or delay the route) and capture the control mid-request: it must show a pending state and refuse a second click.

## Truthfulness under failure (`no-unknown-as-absent`, `no-shared-failure`, `no-dead-end-state`)

- Failed request: block `/api/dashboard` or `/api/grants` in DevTools and capture each section.
- Expired link: open `/consent` or `/device` with a stale query (wait past expiry, or edit `exp`) and submit.
- Server error: stop the relay mid-flow and submit a form.

## Production build

`pnpm --filter @exterior/relay build`. Account pages render from the server build, the dashboard from `dist/public`; check both.
