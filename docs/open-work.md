# Open work

Current roadmap. Decisions: [adr/](./adr/). How agents maintain docs: [../AGENTS.md](../AGENTS.md).

## Not implemented

Code still missing.

- `agent-config check` and `agent-config remove`: the CLI cannot undo a configuration, and a broken one is only found when a connection opens. Check with an ACP `initialize` before writing.
- npm release of `mukae`, `@mukae/contract`, and `@mukae/client`: when the product is ready. Until then, install from the preview published by `.github/workflows/preview.yml`. A checkout still runs `node packages/gateway/dist/cli.js`.

## Awaiting verification

Code exists and has not been verified yet. Delete the bullet once it passes.

- Sign in with GitHub on Mukae, return to Example, see a machine running `mukae daemon`, and open a live ACP session.
- Sidebar sessions per working directory: create, select, and delete a session with a real ACP agent, and check that a session created in one directory keeps that directory after reload.
