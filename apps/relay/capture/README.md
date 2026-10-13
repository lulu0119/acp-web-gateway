# Capture

Screenshots of the relay's pages, for the before/after pair a pull request shows when a surface changed.

```sh
# in the worktree being captured, after `pnpm build` from the repository root
pnpm --filter @mukae/relay capture --label after --port 8891
```

`--label before|after` is required and names the output directory. `--port` defaults to 8799, `--viewport` to `1440x900`, `--out` to `.captures/` at the repository root. Run it once per viewport. It prints one path per surface.

The harness is a script, not a test: it starts its own relay, seeds one account and four devices, connects the two online fixtures as daemons, and signs in the browser. What it captures is a handoff artifact for one pull request — `.captures/` is git-ignored, and the images belong in the GitHub copy, not in this repository.

The procedure around it — which surfaces a change needs, the base worktree, inspecting the images, pairing them — is in [create-pr's visual evidence reference](../../../.agents/skills/create-pr/references/visual-evidence.md). Change `fixtureDevices` and `surfaces` here when a new page needs a pair; a ready condition must also hold in the revision being compared against.
