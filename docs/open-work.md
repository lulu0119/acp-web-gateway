# Open work

Current roadmap. Decisions: [adr/](./adr/). How agents maintain docs: [../AGENTS.md](../AGENTS.md).

## Not implemented

Code still missing.

- Windows and Linux: register the custom scheme, and ask for a configuration name when several configurations share the requested type.
- Config writes: `readGatewayConfig` treats an unreadable file as empty, so `agent-config create` overwrites it. Refuse to write over a file that does not parse.
- `agent-config check` and `agent-config remove`: the CLI cannot undo a configuration, and a broken one is only found when a browser connects. Check with an ACP `initialize` before writing.
- macOS launcher: `register` bakes in the absolute `node` path. Switching Node versions or moving the checkout breaks the handler, and the only symptom is an immediate exit. Resolve `node` when launched, or detect a stale path.
- Connection failure: show the explain page in a new tab instead of replacing the example page, which loses its connections. Open a blank tab inside the click, then point it at the explain page on failure; a later `window.open` is blocked as a popup.
- One list of agent types: `packages/contract`, `packages/gateway/src/agents.ts`, and `apps/example/src/lib/agent-types.ts` each keep a copy.

## Awaiting verification

Code exists and has not been verified yet. Delete the bullet once it passes.

- Several connections at once: each connection runs its own gateway on its own port. Check that a second launch from the browser starts a second gateway, and that closing a connection exits that gateway.
- Sidebar sessions per working directory: create, select, and delete a session with a real ACP agent, and check that a session created in one directory keeps that directory after reload.
