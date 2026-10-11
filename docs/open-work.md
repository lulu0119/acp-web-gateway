# Open work

Current roadmap. Decisions: [adr/](./adr/). How agents maintain docs: [../AGENTS.md](../AGENTS.md).

## Not implemented

Code still missing.

- Windows and Linux: register the custom scheme, and ask for a configuration name when several configurations share the requested type.
- `agent-config check` and `agent-config remove`: the CLI cannot undo a configuration, and a broken one is only found when a browser connects. Check with an ACP `initialize` before writing.
- Connection failure: show the explain page in a new tab instead of replacing the example page, which loses its connections. Open a blank tab inside the click, then point it at the explain page on failure; a later `window.open` is blocked as a popup.
- One list of agent types: `packages/contract`, `packages/gateway/src/agents.ts`, and `apps/example/src/lib/agent-types.ts` each keep a copy.
- npm release of `mukae`, `@mukae/contract`, and `@mukae/client`: after the main flow works and the major bugs are fixed. Until then, the setup instructions install `https://pkg.pr.new/lulu0119/mukae@main`, and a web app adds `https://pkg.pr.new/lulu0119/mukae/@mukae/client@main`. Run `.github/workflows/preview.yml` to publish a newer commit. A checkout still runs `node packages/gateway/dist/cli.js`.

## Awaiting verification

Code exists and has not been verified yet. Delete the bullet once it passes.

- Several connections at once: each connection runs its own gateway on its own port. Check that a second launch from the browser starts a second gateway, and that closing a connection exits that gateway.
- Sidebar sessions per working directory: create, select, and delete a session with a real ACP agent, and check that a session created in one directory keeps that directory after reload.
