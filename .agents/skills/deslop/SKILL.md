---
name: deslop
description: Remove generated slop from the diff against main. Use when finishing a change, or when asked to deslop.
---

# deslop

Check the diff against main and remove generated slop introduced on the branch.

## Focus

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Components from a dependency

A component from shadcn, assistant-ui, or another dependency is source meant to be changed. Fit its styling and behavior to the product.

Keep every variant, size, and subcomponent it came with, including ones no call site uses yet. Deslop the repo's own modules and the call sites that compose the component.

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- The summary is one to three sentences.
