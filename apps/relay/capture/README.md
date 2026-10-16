# Capture

Screenshots of relay pages whose appearance a change affects, for the before/after pair in a pull request.

```sh
# in the worktree being captured, after `pnpm build` from the repository root
pnpm --filter @exterior/relay capture --label after --port 8891 --surface dashboard
```

`--label before|after` names the output directory. `--surface` names one page this change affects; repeat it for each such page. Known names: `dashboard`, `setup-dialog`, `remove-device-dialog`, `authorized-apps`, `consent`, `sign-in`, `device-code`. `--port` defaults to 8799, `--viewport` to `1440x900`, `--out` to `.captures/` at the repository root. Run again with `--viewport 390x844` when the narrow width is part of the change. It prints one path per page.

The script starts its own relay, signs in one account, seeds four devices, connects the two online ones as daemons, and registers and authorizes two web apps, one that names a logo. `.captures/` is git-ignored. The images belong in the GitHub copy, not in this repository.

`vishot render` opens a fresh browser, so a capture of `/` is the sign-in page. Use this script for a page that renders only after the account is signed in. For a page that renders without that account, use `use-vishot`.

Which pages a change needs, the base worktree, and how to pair the images are in [create-pr's visual evidence reference](../../../.agents/skills/create-pr/references/visual-evidence.md). Add a page to `surfaces` in `capture.ts` when a new one needs a pair. Its ready condition must also hold in the revision being compared against.
