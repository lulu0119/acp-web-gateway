# Visual evidence

A before/after pair is one page whose appearance this diff changes. Capture that page from the merge base and from this branch. An unchanged page is not a pair.

## Capture

Take the merge base with `git worktree add`. Leave the working branch checked out as it is.

Build first. The account pages are served from the built relay.

For a page that renders only after the account is signed in, run `apps/relay/capture/capture.ts` once per side. Pass `--surface` for each changed page, and pass the same names on both sides. Give each side its own `--port`. The page names, the default port, and the viewport flag are in [the script's readme](../../../../apps/relay/capture/README.md).

```sh
pnpm --filter @exterior/relay capture --label before --surface <page>
pnpm --filter @exterior/relay capture --label after --port <other> --surface <page>
```

Repeat `--surface` for each changed page. When the narrow width is part of the change, run again with the script's narrow `--viewport`. The file name includes the viewport.

`use-vishot` is for a page that renders without that account, and for a state that needs a click. `vishot render` starts a fresh browser, so a signed-in page comes back as the sign-in page and the command still exits 0.

## Pair

1. Open each image. A blank page, a spinner, an error page, or the sign-in page where another page was asked for is a failed capture. Redo it before writing the body.
2. Both sides show the same page, state, and viewport. The script's fixtures are the data. Keep them the same on both sides.
3. One record per pair, then upload in that order with `upload-github-attachment`:

   ```text
   id: <page>
   title: <page, state>
   viewport: <width>x<height>
   before: <path>
   after: <path>
   ```

   `before: absent` when the diff adds the page. `after: removed` when it deletes the page.

Remove the base worktree after the upload. A page that cannot be captured is named in `## Visual changes` with the reason.
