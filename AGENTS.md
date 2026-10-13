# AGENTS.md

Product narrative: [README.md](README.md). Decisions: [docs/adr/](docs/adr/). Roadmap: [docs/open-work.md](docs/open-work.md).

## Homes

- What the product does stays in README.
- A term crystallizes → root `CONTEXT.md`: what it is, plus `_Avoid_`.
- A choice is hard to reverse, surprising without context, and the result of a real trade-off → next `docs/adr/NNNN-slug.md`.
- Unfinished roadmap only in `docs/open-work.md`. When an item is done, delete the bullet.

## Skills

When the task matches, read the skill before acting.

- Seam or module design → `codebase-design`
- A domain term crystallizes, or a durable choice needs an ADR → `domain-modeling`
- Something is broken, throwing, or slow → `diagnosing-bugs`
- Gathering sources into a dated research note → `research`
- Building or changing a relay page or web app surface → `ux`; auditing one, or verifying a UI change before calling it done → `ux-audit`

## Changes

- If the roadmap gains, finishes, or defers an item, edit `docs/open-work.md` in the same change.
- After a logic change, run deslop. Comments and docs match the code.
- Verify with `pnpm test` and `pnpm build`.
- Repo language is English. Commit subjects are `type(scope):`.
