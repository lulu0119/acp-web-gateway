---
name: create-pr
description: Open a Mukae pull request whose body explains the changed system, proves it with the repository's own checks, and attaches before/after images for every touched web surface. Use when asked to open, create, publish, or prepare a PR from the current branch, or to make a UI change reviewable.
---

# create-pr

A reviewer reads the body before the diff. So the body states what changed in the system, what proves it ran, and — when a surface moved on screen — the images to compare. "Before" comes from `origin/main` as it is now, not from a memory of the old layout.

`AGENTS.md` owns the change rules: which skill to read per task, `pnpm test` and `pnpm build` as the required checks, deslop after a logic change, `docs/open-work.md` edited in the same change, and `type(scope):` commit subjects. This skill adds the PR layer on top of them.

## Workflow

1. Read `AGENTS.md`, then `git status`, the branch, the remotes, and the target branch (`main`).
2. Compute the merge base: `git merge-base origin/main HEAD`, and record the exact `origin/main...HEAD` range the PR will publish. A branch with no commits of its own has nothing to open.
3. Review the whole diff. Trace each changed file to its entry point, callers, state owner, persistence, and external boundary. Separate runtime code from lockfiles, generated files, and fixtures.
4. Run the checks that match the changed surfaces, not a generic set:
   - anything under `packages/` → `pnpm test` and `pnpm build` from the root (they run per workspace)
   - a single workspace → `pnpm --filter @mukae/relay test`, or `... build`
   - `apps/relay/src/web` → the relay must be **rebuilt**: the server serves those pages from `dist/public/.vite/manifest.json`, and a dev server hides a broken production build.
5. Read [the body template](references/pr-body.md) and compose the body from what the checks actually printed.
6. Publish. A UI change is not publishable without its images: run [visual evidence](references/visual-evidence.md) first, and use the `upload-github-attachment` skill for every image.
7. `gh pr create` with the title, base `main`, and the composed body. Then reopen the PR and verify the title, base, head, body, tables, and that each image renders.
8. Read the review threads, comments, and check status. Fix each confirmed error, rerun the focused check, push, and reply on the thread with the evidence.
9. `*.test.ts` beside its source is this repository's test idiom (`apps/relay/src/server/routes/dashboard.test.ts`); a behavior change lands with the test that covers it. The roadmap bullet is deleted in the same change when the work finishes.

## What the body must contain

The contract lives in the template; these are the rules that make it true for this repository.

- `## Summary` and `## Verification` in every PR.
- `## Change map` when more than one module, package, or ownership boundary moved. Name modules (`relay dashboard`, `gateway daemon`, `contract`), never a file list.
- `## Architecture and behavior` when a diagram is faster than prose: an ACP frame path, a ticket lifecycle, a run of the relay state machine.
- `## Boundaries and risks` whenever the change touches tokens, scopes, the consent or approval flow, persistence, or anything a device or web app depends on.
- `## Visual changes` for every user-visible surface the diff touches, with a before/after image pair.

Keep a small local change small. Prose is enough for a rename or a single-component fix; a diagram added only to satisfy the template is noise.

## Evidence language

The relay is a security boundary: it holds account identity, sign-in tokens, device codes, and tickets. Describe what a check proved, and separate these:

- a focused test proves the behavior it exercises
- `pnpm build` and the test run prove static and unit checks only
- the preview workflow (`.github/workflows/preview.yml`) proves the packages publish
- a screenshot or a driven flow proves only the state that was on screen, at that viewport, with that data

Never write "safe", "fixed", or "backward compatible" without naming the evidence. Mark anything unverified as unverified, and name it rather than leaving it out because another check passed.

## Never in the body

Tokens, `better-auth.session_token` values, device codes, ticket URLs, full user rows, webhook payloads, `.env` contents, or a raw SQLite dump. A screenshot is evidence, so open it before putting it in the PR: the relay pages render the signed-in account's name, email, and device hostnames, and those do not belong in a public PR. Crop or reseed with fixture data when it matters.

## When GitHub is unavailable

If `gh` cannot push or create the PR, stop and report the branch, the commit range, and the composed body. Do not open a UI pull request without its images — report the local capture paths instead.
