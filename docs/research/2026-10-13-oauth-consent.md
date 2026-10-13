# Consent screen redesign: OAuth/OIDC research and Mukae audit

Date: 2026-10-13. Scope: relay consent page (`/consent`), pending clients (`POST /api/authorize-request`), scopes, CORS, token binding. Code refs are against `main` at `c94dada`. better-auth / @better-auth/oauth-provider are at 1.7.7 in `node_modules`.

Status after `feat/relay-ux`: A1 and A2 fixed by checking `azp` ([ADR 0014](../adr/0014-tokens-are-told-apart-by-client.md)); A8 partly (the consent page leads with the app's origin, an Unverified pill, the account, and named permissions; the client id moved under Details; icons still pending); A9 fixed (no third-party image is loaded); A12 fixed (`frame-ancestors 'none'`); A14 fixed (devices carry a stable id). The rest is in `docs/open-work.md`.

## 0. Audit summary (what the code does today)

| # | Finding | Where | Severity |
|---|---|---|---|
| A1 | **Any `machines` token can connect as a daemon.** `/api/daemon` uses the same `accessAccount` check as the web-app API: valid JWT, audience = relay, scope `machines`. Web-app tokens and daemon tokens are not told apart. An approved web app (or anyone who steals its token from `sessionStorage`) can open `/api/daemon`, send `hello` with a copied hostname, and appear as a second machine. Every web app of that person then lists it, and ACP frames (prompts, file contents) for sessions opened on it go to the attacker. | `routes/sockets.ts:12-41`, `http.ts:6-15`, `identity/session.ts:21`, `connections/registry.ts:130-131` (hostname is self-reported, id is a fresh `randomUUID`) | High |
| A2 | Reverse direction: a daemon token (device grant) can call `/api/machines` and `/api/sessions` and open agents on **other** machines of the account. A compromised machine can pivot to the others. | `routes/connections.ts:7-28` | Medium |
| A3 | Only one scope exists for both roles: `machinesScope = "machines offline_access"`. The SDK always asks for it; daemon and registered clients are created with it. | `packages/contract/src/index.ts:14`, `packages/client/src/oauth.ts:67,139,264`, `identity/clients.ts:219,255` | — |
| A4 | `openid profile email` are in the server scope list and the resource's `allowedScopes`, but **not grantable** through Mukae-created clients: pending clients are limited by `grantableScopes = ["machines","offline_access"]`, registered/daemon clients carry an explicit `scope`, and better-auth rejects requested scopes outside `client.scopes` (`authorize-K1WHCNih.mjs` ~5585). Dead config; also note DCR is off (`allowDynamicClientRegistration` defaults to false). | `identity/auth.ts:41-42`, `identity/clients.ts:100,118-121` | Low |
| A5 | **Pending client is unauthenticated and self-asserted.** Anyone can `POST /api/authorize-request` with `clientName: "GitHub"`, any https `logoUri`, and their own `redirectUri`. The only name rule is "not starting with Mukae". No rate limit (better-auth's limiter covers only `/api/auth/*`); rows are pruned only after 1 h. | `routes/clients.ts:29-37`, `identity/clients.ts:102-140,143-164,183-200` | High (phishing), Medium (DB spam) |
| A6 | **Approval makes the self-asserted name permanent.** `approvePendingClient` flips `mukae-pending:` to `mukae-open-client:` without any check. | `identity/clients.ts:166-181`, `identity/account.ts:71` | Medium |
| A7 | **Each sign-in creates a new client.** `beginBrowserSignIn` always calls `requestApprovalUrl`, so the cached `client_id` is never reused for authorization. Remembered grants (`hasRememberedGrant`) almost never match, the person approves every time (consent fatigue), and "Connected apps" fills with copies. | `packages/client/src/oauth.ts:289-305`, `identity/grants.ts:69-83`, `identity/account.ts:39-47` | Medium (UX + security habit) |
| A8 | **Consent page shows the raw `client_id` and raw scope string**; it ignores `logoUri`/`clientUri` that `findClientMeta` already returns; the title falls back to the client id; the redirect URI is the only "where" and is shown in small mono text. No resource (machine/agent) is shown. | `identity/account.ts:48-57`, `web/pages/account.tsx:44-66`, `shared/account-web.ts:26` | Medium |
| A9 | **Third-party logo loaded directly in the browser** on the dashboard "Connected apps" list (tracking pixel, mixed trust). | `web/components/grants-section.tsx:53-54` | Medium |
| A10 | **CORS is `origin: "*"`** for all `/api/*`. Bearer tokens, not cookies, so this is not CSRF; but any page holding a leaked token can use it from any origin, and the relay never compares the caller origin with the client's redirect origin. Cookie endpoints (`/api/grants*`, `/api/clients/register`, `/api/dashboard`) rely on SameSite=Lax cookies plus the fact that browsers refuse credentialed requests with `ACAO: *`. | `app.ts:37-41` | Medium |
| A11 | **`/api/acp` WebSocket has no `Origin` check** (CORS does not apply to WebSockets). The ticket is the only guard; acceptable because tickets are single-use and short-lived, but an Origin check is cheap defence in depth. | `routes/sockets.ts:42-76` | Low |
| A12 | **No `frame-ancestors` / `X-Frame-Options`** on `/consent` or `/device`: clickjacking of the Approve button is possible. | no match for `frame-ancestors`/`secureHeaders` in `apps/relay/src` | Medium |
| A13 | Device approval page shows only the user code; nothing about the requesting machine (IP, rough location, time). RFC 8628 §5.4 remote phishing applies. | `web/pages/account.tsx:68-87`, `identity/account.ts:79-91` | Medium |
| A14 | Machine ids are not stable (new `randomUUID` per daemon socket), so a grant cannot be bound to "this machine" across reconnects. Blocks per-machine consent (§6). | `connections/registry.ts:124-131` | Design gap |
| A15 | Browser tokens (access + refresh) live in `sessionStorage`. better-auth rotates refresh tokens (`introspect-*.mjs` ~1570), which satisfies the Browser-Based Apps BCP only if an absolute lifetime cap is also set. | `packages/client/src/react.tsx:22`, `oauth.ts:231-235,425-435` | Low/Medium |

---

## 1. App icon: relay fetches and serves it

**What the specs say**
- RFC 7591 §2 `logo_uri`: "If present, the server SHOULD display this image to the end-user during approval." §5: the server SHOULD check that `logo_uri`, `client_uri`, `policy_uri`, `tos_uri` share host and scheme with `redirect_uris` for open registration, and may download and scan the content. <https://www.rfc-editor.org/rfc/rfc7591.html>
- OIDC Dynamic Client Registration §2 defines the same `logo_uri`, with BCP 47 language variants (`logo_uri#ja`). <https://openid.net/specs/openid-connect-registration-1_0.html#ClientMetadata>
- CIMD draft §8.8: the AS SHOULD **prefetch `logo_uri` and cache it** for the life of the metadata document, so the logo cannot change after review and cannot track users across domains. §8.6: MUST NOT fetch URLs that resolve to special-use addresses (RFC 6890); MUST NOT follow redirects (§5). <https://drafts.oauth.net/draft-ietf-oauth-client-id-metadata-document/draft-ietf-oauth-client-id-metadata-document.html>
- OWASP SSRF cheat sheet: block private/reserved ranges for IPv4 and IPv6, validate the *resolved* address and connect only to it (rebinding), disable redirects, allowlist schemes. <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>

**Recommendation for Mukae**
1. Fetch once, at `POST /api/authorize-request` (or lazily on first consent render, then frozen). Store bytes in the DB keyed by `sha256`; store the hash on the client row. Never store or render the original URL in HTML.
2. Serve from `GET /api/client-icons/:sha256.png` with `Content-Type: image/png`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: public, max-age=31536000, immutable`, `Cross-Origin-Resource-Policy: same-origin`. Consent page and dashboard use only this path (fixes A9).
3. Fetch rules:
   - `https:` only, port 443 only, no userinfo.
   - Resolve DNS yourself, reject if **any** answer is in 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.168/16, 198.18/15, 224/4, 240/4, ::1, ::/128, fc00::/7, fe80::/10, ff00::/8, IPv4-mapped/NAT64 forms of the above. Connect to the validated IP (undici `Agent({ connect: { lookup } })`) while sending the original SNI/Host. This defeats DNS rebinding.
   - `redirect: "manual"`; either reject 3xx (CIMD rule) or follow at most 1 hop with full re-validation.
   - 5 s total timeout; abort after 256 KB; no cookies; no `Referer`; generic `User-Agent: Mukae-IconFetcher`.
   - Sniff magic bytes (PNG, JPEG, WebP, GIF, ICO); ignore the remote `Content-Type`. Decode and **re-encode** to a 128×128 PNG (strips metadata, polyglots, decompression bombs: cap decoded pixel count). If adding a native image dependency is unwanted, the fallback is strict magic-byte allowlist + `nosniff` + sandbox CSP, but re-encoding is the safe choice.
   - **SVG: reject** (or rasterize server-side with no external refs). SVG can carry script, external fetches (tracking), and XML entity bombs.
4. On any failure, render a generated monogram (first letter on a color derived from the origin). Never fall back to the remote URL.
5. Privacy: the person's browser never contacts the third party before consent. The fetch reveals only the relay IP to the app.
6. Apply the RFC 7591 §5 same-origin rule as a *signal*, not a block: a logo from another host is still fetched, but it does not count toward "verified".

## 2. Apps not reachable from the internet (data-URI icons)

Options compared:

| Option | Works for localhost / LAN app? | Who proves what | Notes |
|---|---|---|---|
| **Icon bytes in the `POST /api/authorize-request` body** (`logo: "data:image/png;base64,…"`) | Yes | Nothing; self-asserted like the name | Already a POST, so size is not a URL problem. Cap at 64 KB decoded, same sniff + re-encode pipeline. Cheapest. |
| Registration page on the relay (exists: `POST /api/clients/register`, signed-in, owner known) | Yes | Owner = a Mukae account | Adds file upload for the icon. Owner can be shown ("Registered by @login"). Best for apps that want a stable `client_id`. |
| **RFC 7591 Dynamic Client Registration** <https://www.rfc-editor.org/rfc/rfc7591.html> | Yes | Nothing unless a **software statement** (§2.3, signed JWT of metadata from a trusted issuer) is required | Mukae's pending client is effectively a custom DCR. better-auth supports DCR but it is off. A software statement only adds trust if Mukae (or a publisher Mukae trusts) signs it. |
| **Client ID Metadata Documents** (draft-ietf-oauth-client-id-metadata-document, latest Aug 2026) | **No.** `client_id` is an https URL the AS fetches; it must be publicly reachable (§1, §3). Appendix A allows a hosted "CIMD service" for dev. | Control of the origin that hosts the JSON | MCP 2025-11-25 made CIMD the default registration path and demoted DCR. <https://aaronparecki.com/2025/11/25/1/mcp-authorization-spec-update>, <https://workos.com/blog/client-id-metadata-documents-cimd-oauth-client-registration-mcp> |

**Recommendation.** Accept `logo` as a data URI in the POST body now (same pipeline as §1; `logoUri` stays optional for public apps). Support CIMD later as the *verified* path for public apps (the hostname is proven by the fetch, and the logo/name come from a document under that origin). Localhost apps stay "unverified, on this computer".

## 3. Show where the app runs; bind the token to the origin

**What the specs say**
- CIMD §8.5: the AS SHOULD display the **hostname of the client_id** in addition to fetched metadata.
- Browser-Based Apps BCP (draft-ietf-oauth-browser-based-apps-26, in RFC Editor queue) <https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps-26>: browser public clients are exposed to every XSS scenario (§5, §6.3); refresh tokens MUST be rotated or sender-constrained and MUST have an absolute lifetime that rotation never extends (§6.3.2.3); DPoP helps against offline exfiltration but not against an attacker running a fresh flow in the page (§5.1.3, §9.2); resource servers should use strict CORS (§5.2.3). BFF is the strongest pattern.
- DPoP, RFC 9449 <https://www.rfc-editor.org/rfc/rfc9449.html>: token bound to a key pair held by the client (WebCrypto, non-extractable); every request carries a signed `DPoP` proof with `htm`, `htu`, `iat`, `jti`, `ath`. Refresh tokens for public clients are bound too (§5). better-auth 1.7.7 oauth-provider already has DPoP options and the `dpop_bound_access_tokens` client field.
- OAuth 2.0 Security BCP, RFC 9700 §4.14 (refresh token protection for public clients) <https://www.rfc-editor.org/rfc/rfc9700.html>. OAuth 2.1 draft makes PKCE mandatory and requires rotation or sender-constraint for public-client refresh tokens <https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/>.
- CORS is enforced only by browsers. `Origin` can be forged by any non-browser client, so an origin check limits *web pages*, not attackers with `curl`.

**Recommendation**
1. **Consent shows origin, not client id.** Derive `origin = new URL(redirect_uri).origin` (exact string the code will be sent to). That is the one fact the relay can prove at redirect time. Show the client id only under "Details".
2. **Allowed origins per client** = set of origins of `redirect_uris` (pending clients have exactly one). Store on the client row.
3. **Resource API checks the caller.** In `accessAccount`, read `azp` (better-auth puts the client id in `azp`) and look up allowed origins. If the request has an `Origin` header and it is not in the set, return 403. Replace `cors({origin:"*"})` on `/api/machines` and `/api/sessions` with a dynamic `origin` callback that echoes only allowed origins (preflight has no token, so the preflight can allow any origin; the actual request is checked against the token's client). Daemon requests have no `Origin` and are told apart by `azp` (see §6).
4. Add the same `Origin` check on the `/api/acp` upgrade: the ticket records the origin of the `POST /api/sessions` that minted it; the socket's `Origin` must match (A11).
5. **DPoP later** (§(c)): the real sender constraint. The SDK generates a non-extractable key in IndexedDB; relay requires `DPoP` on pending clients. Origin checks are the cheap first step.
6. Set an absolute refresh lifetime for browser clients (e.g. 7–30 days) and keep rotation on (A15).

## 4. App name and App URL; merge redirect URL and app URL?

- `client_uri` (RFC 7591 §2) is the app's homepage, "SHOULD display ... in a clickable fashion". `redirect_uris` is where codes go. They are different fields, but for display the **redirect origin is the trustworthy one** and `client_uri` is self-asserted.
- **Merge rule:** show one "App URL" = redirect origin. Accept `clientUri` only if same origin as the redirect (RFC 7591 §5); otherwise drop it. Show the full redirect URL only under "Details".
- **Vendor patterns**
  - Google: apps that request sensitive scopes without verification get a "Google hasn't verified this app" interstitial and a 100-user cap. <https://support.google.com/cloud/answer/7454865>, <https://developers.google.com/identity/protocols/oauth2/production-readiness/overview>
  - Microsoft Entra: a blue "verified" badge and publisher name when the publisher is verified, otherwise the word "Unverified". <https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview>
  - GitHub: the authorize page shows the app owner, a "Not owned or operated by GitHub" line for third parties, and the redirect host. <https://github.com/desktop/desktop/issues/3224>
  - Cloudflare (Apr 2026): consent shows who created the app (owner + contact), an explicit permission list, and per-account checkboxes; optional scopes can be edited (Aug 2026). <https://developers.cloudflare.com/changelog/post/2026-04-14-oauth-consent-and-revoke/>, <https://developers.cloudflare.com/changelog/post/2026-08-22-wrangler-mcp-optional-oauth-scopes/>
  - Slack: workspace admins can require approval for apps; installs come from public distribution or the Marketplace. <https://slack.com/help/articles/222386767-Manage-app-approval-for-your-workspace>
- **Phishing of `clientName`.** Today anyone can POST `clientName: "GitHub"` (A5). Mitigations, in order:
  1. Make the origin the **headline identity** ("app.example.com wants to …") and the name a secondary, quoted label ("calls itself “GitHub”").
  2. Add an "Unverified" pill for every pending client and every localhost origin.
  3. Reject names that are a confusable of reserved brands (Mukae, GitHub, Google, Anthropic, Cloudflare …) after Unicode NFKC + confusable skeleton (UTS #39), and reject names that look like a domain different from the origin.
  4. Limit `clientName` to printable characters; strip bidi controls.

## 5. How OAuth/OIDC frames consent overall

- OIDC Core §3.1.2.4: the AS obtains consent "through an interactive dialogue with the End-User that makes it clear what is being consented to", or by other means; §3.1.2.1 `prompt=consent` forces it again, `prompt=none` forbids UI. <https://openid.net/specs/openid-connect-core-1_0.html#Consent>
- OIDC Registration §2: `client_name`, `logo_uri`, `client_uri`, `policy_uri`, `tos_uri` may carry BCP 47 tags (`client_name#ja`); RFC 7591 §2.2 recommends also sending an untagged value. `policy_uri`/`tos_uri` should be shown as links when present.
- RFC 6749 §10.2 / RFC 9700: public clients cannot be authenticated, so the AS must not rely on client identity alone and should be careful with automatic re-approval for them.
- Verified publishers (Google, Microsoft, Cloudflare owner info) are all *out-of-band* trust that the protocol does not provide. CIMD is the first in-protocol way to tie a client to a domain.

**Recommendation.** Never auto-approve pending or localhost clients (honour `prompt=consent`; ignore remembered grants for unverified clients unless the same `client_id` and origin come back). Allow `policy_uri`/`tos_uri` only if same-origin. Localized names: accept `clientName#<tag>` later; low priority.

## 6. Scopes and resources

**Specs**
- RFC 8707 Resource Indicators: `resource` names the API; the token's `aud` is that API. Mukae already sends `resource=<relay origin>` (`identity/clients.ts:333`, `oauth.ts:71,139`). <https://www.rfc-editor.org/rfc/rfc8707.html>
- RFC 9396 Rich Authorization Requests: `authorization_details=[{type, locations, actions, identifier…}]` for fine-grained, per-object grants; the AS may let the user narrow them at consent and returns the granted set in the token response. <https://www.rfc-editor.org/rfc/rfc9396.html>. better-auth does not implement RAR; Mukae would store the choice itself.

**Proposed scope set**

| Scope | Grants | Who | Shown as |
|---|---|---|---|
| `machines:read` | `GET /api/machines` (hostnames, agent names) | web apps | "See your machines and their agents" |
| `agents:connect` | `POST /api/sessions` (+ ticket) on **selected** machines/agents | web apps | "Open agent sessions — the agent can read and change files on that machine" |
| `offline_access` | refresh token | web apps, daemon | "Stay connected after you close the tab" |
| `daemon` | `/api/daemon` only | **only** the daemon client (`software_id=mukae-daemon`) | device page: "Let this computer run agents for your account" |
| `openid` (optional) | `sub` via userinfo (the SDK's `fetchMukaeUser`) | web apps that need a stable account id | "Know which Mukae account you use" |

Drop `profile`/`email` from `auth.ts:41-42` until something needs them.

**Resource selection at consent.** Default "All machines, now and later"; option "Only: [machine ▾] [agent ▾]". Store the selection on the consent row (or a side table) and enforce it in `openSession`. This needs a stable machine id (A14): derive it from the daemon's sign-in (e.g. the refresh-token family or a machine key registered at `mukae login`) instead of `randomUUID` per socket. RAR is the standard shape if the SDK later asks for a specific agent up front: `authorization_details=[{"type":"mukae_agent","actions":["connect"],"identifier":"<machine>/<agent>"}]`.

**Fix A1/A2 independent of the new scopes:** in `accessAccount`, also return `azp`; `/api/daemon` requires `azp === daemonClientId` (and `daemon` scope once it exists); `/api/machines` and `/api/sessions` require `azp !== daemonClientId`. Alternatively give the daemon a separate resource (`<relay>/daemon`) so `aud` differs (RFC 8707).

## 7. Recommended consent page order

1. **Identity row:** [app icon, relay-served] ⇄ [Mukae icon].
2. **Headline:** "**app.example.com** wants to use your agents" — origin in bold; under it: `“My Notes App”` + pill: *Unverified* / *Registered by @login* / *Verified domain* (CIMD). Localhost: "runs on this computer (localhost:5173)".
3. **Account:** "Signed in as @github-login · Not you? Switch account" (GitHub is the only IdP; switch = sign out + sign in).
4. **Permissions, grouped**, each with one plain line of consequence:
   - Machines: "See your machines and their agents"
   - Agents: "Open agent sessions" + resource picker (All / choose machine + agent)
   - Access duration: "Stay connected" (offline_access) with the refresh lifetime
5. **Warning box** only when unverified or name/origin mismatch: "Mukae has not checked who runs this site. Approve only if you opened it yourself."
6. **Details (collapsed):** full redirect URL, client id, created at, `policy_uri`/`tos_uri` links if same-origin.
7. **Buttons:** `Cancel` (secondary, left) and `Authorize` (primary, right). Send `frame-ancestors 'none'` on this page (A12).
8. Footer: "You can revoke this at any time in Mukae → Connected apps."

---

## Prioritized recommendations

**(a) Ship now in the relay (no new infrastructure)**
1. Tell daemon and web-app tokens apart by `azp` (or `aud`): `/api/daemon` only for the daemon client; `/api/machines`, `/api/sessions` never for it (A1, A2). Highest priority.
2. Consent page: origin as headline, name as quoted label with *Unverified* pill, hide raw client id under Details, human scope text, signed-in account line, Cancel/Authorize (A8, §7).
3. `Content-Security-Policy: frame-ancestors 'none'` (+ `X-Frame-Options: DENY`) on `/consent`, `/device`, `/sign-in` (A12).
4. Server-side icon fetch with SSRF guards, re-encode to PNG, serve from `/api/client-icons/:hash`; accept `logo` data URI in the POST body; dashboard stops loading remote logos (§1, §2, A9).
5. Name rules: NFKC + confusable check against reserved brands, strip bidi/control chars; drop `clientUri`/`policy_uri`/`tos_uri` not same-origin as the redirect (A5, §4).
6. Rate-limit `POST /api/authorize-request` per IP and cap pending rows (A5).
7. Reuse the cached `client_id` in the SDK when the redirect origin matches, so returning users do not create new clients (A7).
8. Per-client allowed origins from `redirect_uris`; check `Origin` on `/api/machines`, `/api/sessions`, and the `/api/acp` upgrade; replace `origin:"*"` with an echo of allowed origins (A10, A11).
9. Remove `profile`/`email` from the server scope list; set an absolute refresh-token lifetime for browser clients (A4, A15).
10. Device page: show requesting IP/approximate location and time (A13).

**(b) Needs a product-owner decision**
1. Scope set and names (`machines:read`, `agents:connect`, `daemon`, `offline_access`, optional `openid`) and whether web apps may ask for only `machines:read`.
2. Per-machine/per-agent selection at consent (requires stable machine ids, A14) — and the default ("All machines" vs. "choose").
3. What "verified" means: registered-by-account (owner shown), CIMD domain proof, manual review by Mukae, or a combination; and whether unverified apps get extra friction (interstitial, user cap like Google).
4. Whether to block brand-like names or only warn.
5. Refresh lifetime for browser apps and whether `offline_access` is optional in the UI (Cloudflare-style editable optional scopes).

**(c) Later**
1. DPoP (RFC 9449) for pending/browser clients, with SDK key in IndexedDB; require it once the SDK ships it.
2. Client ID Metadata Documents as the verified path for public apps (MCP-compatible).
3. RFC 9396 `authorization_details` for app-chosen agent targets.
4. Localized `client_name#tag`; BFF guidance in the SDK docs for sensitive apps.
