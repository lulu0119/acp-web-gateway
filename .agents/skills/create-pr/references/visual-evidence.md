# Visual evidence

How to get a comparable before/after pair for a relay or web app surface. This repository has no Storybook, no visual test runner, and no Playwright dependency; the surfaces are routes of a running relay, so the pair is two relays running side by side — the merge base and the change.

Follow this when the diff moves anything a person sees: layout, hierarchy, copy on a page, a state (empty, loading, error, offline), a viewport, a theme. A copy tweak inside one line of a component still counts, because the reviewer cannot otherwise tell where the pixels moved. Skip it for changes with no rendered surface.

## The pair

| | Before | After |
| --- | --- | --- |
| Source | `git worktree add <path> <merge-base>` | the contributor's worktree, unchanged |
| Port | 8799, and `BETTER_AUTH_URL` set to it | 8787 (or the dev pair 8787 + 47102) |
| Data | the same fixture set | the same fixture set |
| Browser | the same viewport, theme, locale | the same viewport, theme, locale |

Never check out or reset the contributor's worktree to reach the base commit. Take a detached worktree of the merge base, run that relay on its own port, and leave the active branch alone. Two relays at once is expected here, which is why the base run uses 8799 — 8787 belongs to whoever is working.

## Running a relay for a capture

`apps/relay/.env.example` lists the variables. A capture run needs a secret and a port; GitHub keys only for real sign-in, which the seed below replaces.

```sh
RUN=<scratch>/relay
mkdir -p "$RUN/data"
ln -s <repo>/apps/relay/dist "$RUN/dist"
ln -s <repo>/apps/relay/node_modules "$RUN/node_modules"
cd "$RUN" && BETTER_AUTH_URL=http://127.0.0.1:8799 PORT=8799 HOST=127.0.0.1 \
  BETTER_AUTH_SECRET=<32+ chars> GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=y \
  node dist/main.js
```

`better-sqlite3` is ABI-specific: run the relay with the Node that built it (`pnpm exec node -p process.execPath`), not with a different one from `PATH`, or it fails with `NODE_MODULE_VERSION`.

Run the base worktree's own `pnpm install && pnpm --filter @mukae/relay build` first. A base commit whose build fails is not a base — say so instead of comparing against a broken page.

## Signing the capture in

Sign-in needs GitHub, and a screenshot of the sign-in page is rarely the pair anyone needs. Seed a session instead, the way `apps/relay/src/server/routes/dashboard.test.ts` does: open the run's SQLite file through `openMukaeAuth` in a scratch script, create a user and a session with `context.internalAdapter`, and sign the token with the secret to make the `better-auth.session_token` cookie. Then set that cookie in the browser context before navigating.

Data matters as much as the layout. The dashboard only shows hierarchy at realistic volume: seed several devices — one connected, one offline with a last-seen time — with a few agents each, and one approved web app. Audit the empty state and the populated state separately, and name which one each image shows.

## Ports and surfaces

| Surface | Route | Rendered by |
| --- | --- | --- |
| Dashboard | `/` | the browser, from `/api/dashboard` |
| Sign-in | `/sign-in` | the server |
| Device code entry | `/device` | the server |
| Device approval | `/device?user_code=…` | the server |
| Consent | `/consent` | the server |

Account pages (`/sign-in`, `/device`, `/consent`) render server-side from `apps/relay/src/web/pages/account.tsx`, so a change there is invisible until the relay is rebuilt or restarted — and a dev-server screenshot would not prove the production page changed. Capture account pages from the built relay on 8799 and 8787. The dashboard can be captured from the built relay too, which is the honest pair; `WEB_DEV_SERVER_URL` + `pnpm --filter @mukae/relay web` on 47102 is for iterating, not for evidence.

## Capturing

Screenshots land in `.captures/`, which `.gitignore` covers through `dist/`-style ignore rules only if it is added there — add it if it is missing, and never commit a capture. Name each file by surface, state, and viewport so a pair is obvious: `.captures/<side>-<surface>-<state>-<width>.png`.

Any of these produce the file:

- A headless browser already on the machine. `npx playwright screenshot --viewport-size "1440,900" --wait-for-selector "<ready selector>" http://127.0.0.1:8799/ .captures/before-dashboard-1440.png` covers a signed-out page; a seeded cookie needs the scripted form below.
- A scratch script running `playwright` (or `puppeteer`) from a temporary directory outside the repository, which can set the cookie, wait for a settled state, and capture several routes in one pass. Do not add the dependency to `package.json` for a PR: the capture is handoff data, not a repository capability.
- An agent GUI session against the running relay, screenshotting the surface directly.

Whatever the tool, wait for the state to settle — data loaded, no spinner, fonts applied — before the shutter. `--wait-for-timeout` is a guess; a selector for the settled state is evidence.

## Inspecting and pairing

1. Open every image. A blank page, a loading skeleton, an error page, a sign-in redirect, or an unstyled page is not a pair — it is a capture failure, and it stops the PR body until it is redone.
2. Confirm both sides show the same surface, state, viewport, theme, locale, and fixture data. A "before" at 1440×900 against an "after" at 390×844 shows nothing.
3. Keep one record per pair for the handoff:

   ```text
   id: dashboard-devices
   title: Dashboard / devices
   route: /
   viewport: 1440x900
   data: 3 devices (1 offline), 1 approved app
   before: /abs/repo-base/.captures/before-dashboard-devices-1440.png
   after: /abs/worktree/.captures/after-dashboard-devices-1440.png
   ```

   Use `before: absent` for a surface the change adds and `after: removed` for one it deletes.
4. Capture the narrow viewport too (390×844) when the change touches layout — the relay pages are built for both, and hierarchy often breaks only in one.
5. Upload each file with the `upload-github-attachment` skill, keeping the argument order aligned with the pair record, then remove the base worktree once the upload succeeded.

A capture that cannot be made — the surface needs a real GitHub sign-in, the base build fails — is reported as an unverified state in the PR body with the reason, never quietly dropped from `## Visual changes`.
