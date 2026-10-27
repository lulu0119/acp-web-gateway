# PROJECT.md — acceptance adapter for Exterior

## 1. Project summary

Exterior is an account and relay that lets a web app reach an ACP agent on a device the person owns. Layout that matters for testing:

- `apps/relay` — the relay: Hono server, better-auth (GitHub sign-in, OAuth provider, device authorization), server-rendered account pages (`/sign-in`, `/device`, `/consent`) and the client-rendered dashboard (`/`). Built output: `apps/relay/dist`.
- `packages/gateway` — the `exterior` CLI (`login`, `logout`, `status`, `daemon`, `agent`, `registry`, `config`). Built output: `packages/gateway/dist/bin/exterior.mjs`.
- `packages/sdk` — the EAP SDK (`@exterioragentprotocol/sdk`): wire messages, client, device, and relay entries. `packages/contract` — Exterior's own constants shared by the above.
- `apps/example` — one web app that uses the SDK.

## 2. Environment

- **Build:** `pnpm install && pnpm build` (from the repo root). Account pages render from the server build, so rebuild after any change under `apps/relay/src/web` or `packages/ui`.
- **Start relay (isolated):** run from a scratch directory, never the repo, so `data/relay.sqlite` is a throwaway:
  ```sh
  RUN=<scratch>/relay && mkdir -p $RUN/data $RUN/home
  ln -sfn <repo>/apps/relay/dist $RUN/dist
  ln -sfn <repo>/apps/relay/node_modules $RUN/node_modules
  cd $RUN && BETTER_AUTH_URL=http://127.0.0.1:8799 BETTER_AUTH_SECRET=<32+ chars> \
    GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=y PORT=8799 $NODE dist/main.js
  ```
  Base URL `http://127.0.0.1:8799`. Port 8787 is the developer's default relay; do not use it.
- **Stop:** kill the PID this run started. Never `pkill -f dist/main.js` while another relay may run.
- **Required services:** none (SQLite file, in-process registry).
- **Already-running detection:** `curl -s http://127.0.0.1:8799/health` → `{"status":"ok"}`.
- **Env / ports:** `apps/relay/.env.example`; the relay reads `BETTER_AUTH_URL`, `PORT`, `HOST`, `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `WEB_DEV_SERVER_URL`, `LOG_FORMAT`.
- **Node:** `better-sqlite3` is ABI-specific, so run the relay and seed scripts with the Node that built it: resolve it once inside the repo (`NODE=$(pnpm exec node -p process.execPath)`) and call `$NODE` from the scratch directory. Outside the repo, `pnpm exec node` and `npx` can resolve a different Node and fail with `NODE_MODULE_VERSION`.

## 3. Auth

- **Test account:** seeded, no GitHub. A seed script opens `data/relay.sqlite` through `dist/server/identity/auth.js` (`openExteriorAuth`), creates a user and session with `context.internalAdapter`, and prints the cookie `better-auth.session_token=<token>.<base64 HMAC-SHA256(token, secret)>` (URL-encoded), the same signing as `apps/relay/src/server/testing.ts` (`sessionCookie`). It may also record devices with `dist/server/devices/store.js`.
- **Web status check:** `GET /api/dashboard` with the cookie → 200 (signed in) or 401.
- **CLI (device) auth:** `HOME=$RUN/home node <repo>/packages/gateway/dist/bin/exterior.mjs login --relay http://127.0.0.1:8799`, approve the printed code in the browser session; `exterior status` lists the sign-in.

## 4. Surfaces

### Web

- Launch: the relay from §2. Base URL `http://127.0.0.1:8799`.
- agent-browser session: `exterior-<run-id>`; inject the seeded cookie for `127.0.0.1` before opening `/`.

### CLI

- Invocation: `node packages/gateway/dist/bin/exterior.mjs` with `HOME` pointed at the run's scratch home so the developer's `~/.config/exterior` is untouched.
- Daemon: `exterior agent create opencode` then `exterior daemon --relay http://127.0.0.1:8799` (needs network for the ACP registry once).

## 5. Project probes & quick navigation

- Auth probe: `curl -s -o /dev/null -w '%{http_code}' -H "cookie: $COOKIE" $BASE/api/dashboard`.
- Dashboard state: `curl -s -H "cookie: $COOKIE" $BASE/api/dashboard` → `{ userName, devices[], sessions[] }`.
- Start an app approval without a web app: `POST $BASE/api/authorize-request` with `{ clientName, redirectUri, scopes:["machines","offline_access"], state, codeChallenge }` → `{ url }`; open `url` signed in to reach `/consent`.
- Routes: `/` (dashboard), `/device`, `/device?user_code=…`, `/consent?…`, `/sign-in`.

## 6. Known constraints

- `/sign-in` with real GitHub needs real OAuth credentials; use the seeded session instead.
- An expired consent can be forced by editing `sig` in the page's hidden `query` inputs before submitting.
- Verifying a real access token fetches the relay's own JWKS over HTTP, so token-path checks need the relay listening, not `app.request`.
