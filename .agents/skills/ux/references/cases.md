# Cases

Instances of each `ux` rule in this repository. ❌ is a violation, ✅ is a case worth copying. Each entry gives the baseline it was observed at; line numbers move, so re-check before citing.

Paths are relative to `apps/relay/src/` unless they start with `apps/` or `packages/`.

Seeded from the first audit of the relay pages (`c94dada`, 2026-10-13; L1 from code, L2 from the reported screenshots) and the change that followed (`feat/relay-ux`; L1, L2 at 1280×860 and 390×844, L3 driving `exterior login` → approve → `exterior daemon` against a seeded relay).

Add entries under the rule's heading as `- ❌ <hash>: <finding>. <path>` or `- ✅ <hash>: <behavior>. <path>`.

## no-unknown-as-absent

- ❌ `c94dada`: authorized apps returned early on a failed `/api/grants` and showed "No app has been approved yet." `web/components/grants-section.tsx`
- ✅ `feat/relay-ux`: authorized apps keep loading, error with Try again, and empty apart. `web/components/grants-section.tsx`

## no-silent-drop

- ❌ `c94dada`: the dashboard listed only devices whose daemon was connected, under the heading "Machines"; a device approved a minute earlier was missing. `server/routes/dashboard.ts`
- ✅ `feat/relay-ux`: devices persist with a stable id from `exterior login`; offline ones stay listed with last seen. L3: approved in the browser, listed before the daemon ran, Connected after, "Just now" after stopping it. `server/devices/store.ts`, `server/routes/dashboard.ts`

## no-shared-failure

- ✅ `c94dada`: a failed dashboard refresh keeps the last data and says it is retrying. `web/pages/dashboard.tsx`

## no-dead-end-state

- ❌ `c94dada`: an expired consent link threw inside `oauth2Consent` and reached the browser as plain-text "Internal Server Error". `server/identity/account.ts` (`decideConsent`)
- ❌ `c94dada`: "Machine approved" said only "Return to the machine." with no next step. `web/pages/account.tsx`
- ✅ `feat/relay-ux`: an expired approval offers "Start again", which re-sends the original authorize request for a fresh link; any other unhandled error renders a full page with Try again. `server/identity/account.ts` (`expiredApproval`), `server/app.ts` (`onError`)
- ✅ `feat/relay-ux`: device approval ends on a check mark with next steps for the person setting up and the commands for a developer. `web/pages/account.tsx` (`DeviceApproved`)

## no-arbitrary-space

- ❌ before the spacing scale: list rows used `px-4 py-3`, the empty state used `px-6 py-10`, and the dashboard separated regions with `gap-14` and `pb-24`. `apps/desktop/src/relays-section.tsx`, `packages/ui/src/empty-state.tsx`, `apps/relay/src/web/pages/dashboard.tsx`
- ✅ spacing scale: those surfaces use one padding step on every side. Same paths.

## no-flat-hierarchy

- ❌ `c94dada`: the consent heading printed the full app URL at display size and wrapped. `web/pages/account.tsx`
- ❌ `d3f06a4` (2026-10-13; L2, 1280×900 and 390×844): dashboard peer headings were 30px and 20px; device names were smaller than their descriptions. `web/pages/dashboard.tsx`, `web/components/grants-section.tsx`
- ✅ `d3f06a4` + dashboard hierarchy change (L2, desktop and 390×844): keeping the device table and agent chips, both sections use 16px/600 entity names, 12px timestamps, 32px icons and 16px row padding. App origins use 14px/500 and authorization dates occupy a separate level. `web/components/section-heading.tsx`, `web/pages/dashboard.tsx`, `web/components/grants-section.tsx`

## no-buried-answer

- ❌ `c94dada`: "Approve another machine" sat at the bottom of the page, below authorized apps. `web/pages/dashboard.tsx`
- ✅ `feat/relay-ux`: "Add device" sits beside the Devices heading and opens setup steps or code entry. `web/pages/dashboard.tsx`

## no-equal-weight-noise

## no-indistinct-identity

- ❌ `c94dada`: the consent card's subject was the client id ("mIBRx… is asking for machines offline_access"). `web/pages/account.tsx`
- ✅ `feat/relay-ux`: consent leads with the app name, its origin, an Unverified pill, and permissions named for a person; the client id is under Details. `web/pages/account.tsx` (`Consent`), `server/identity/account.ts` (`describeScopes`)

## no-lost-context

## no-inconsistent-readout

## no-inert-action

- ✅ `d3f06a4` + dashboard split button (2026-10-13; L2/L3, desktop and 390×844): the primary link opens device-code entry directly; the separate menu retains setup and code entry, with keyboard navigation and focus return. `web/pages/dashboard.tsx`

## no-false-feedback

- ❌ `c94dada`: buttons had no pointer cursor (Tailwind 4 preflight) and form buttons had no pending state, so Approve could be pressed twice. `packages/ui/src/button.tsx`
- ✅ `feat/relay-ux`: a base rule gives every clickable role a pointer; `Button` has `loading`; `PendingForm` spins the pressed button and disables its sibling across forms. L3: after clicking Connect device, `aria-busy=true`, spinner shown, Deny disabled. `web/styles.css`, `web/components/pending-form.tsx`
- ✅ `feat/relay-ux`: revoking reports a failure instead of silently reloading. `web/components/grants-section.tsx`

## no-input-hijack

- ✅ `feat/relay-ux`: the device-code field accepts typing and paste, uppercases, and skips the dash. `packages/ui/src/otp-field.tsx`
