# AGENTS.md

Product narrative: [README.md](README.md). Decisions: [docs/decisions.md](docs/decisions.md) (every `adr/` file listed). Manual: [docs/manual.md](docs/manual.md). Roadmap: [docs/open-work.md](docs/open-work.md).

## Homes

- What the product does stays in README.
- Device setup and relay operation go in `docs/manual.md`; the web app SDK is documented in `packages/client/README.md` beside the code.
- Every `docs/adr/NNNN-slug.md` is listed in `docs/decisions.md` with its status.
- A research note carries a `Status` line: consumed by an ADR, partially applied with a pointer, or rejected with the reason.
- A term crystallizes → root `CONTEXT.md`: what it is, plus `_Avoid_`.
- A choice is hard to reverse, surprising without context, and the result of a real trade-off → next `docs/adr/NNNN-slug.md`.
- Unfinished roadmap only in `docs/open-work.md`. When an item is done, delete the bullet.

## Skills

When the task matches, read the skill before acting.

- Seam or module design → `codebase-design`
- A domain term crystallizes, or a durable choice needs an ADR → `domain-modeling`
- Something is broken, throwing, or slow → `diagnosing-bugs`
- Gathering sources into a dated research note → `research`
- Building or changing a relay page, the desktop window, or a web app surface → `ux`; auditing one, or verifying a UI change before calling it done → `ux-audit`
- A screenshot of a relay or web page → `use-vishot`
- Opening a PR → `create-pr`. A before/after image is for each page whose appearance this diff changes. Putting that image in the body → `upload-github-attachment`

## Changes

- If the roadmap gains, finishes, or defers an item, edit `docs/open-work.md` in the same change.
- After a logic change, run deslop. Comments and docs match the code.
- Verify with `pnpm test` and `pnpm build`.
- Repo language is English. Commit subjects are `type(scope):`.
