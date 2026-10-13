---
name: upload-github-attachment
description: Put a local image or recording into GitHub's user-attachments storage and get back a URL that Markdown can embed. Use before writing a PR, issue, or comment that carries a before/after screenshot, so the evidence lives in the GitHub copy and no image is committed. Run `scripts/upload-github-attachment.mjs` with the file paths.
---

# upload-github-attachment

A PR that shows a UI change needs the images to live somewhere GitHub will still serve tomorrow. Attachments are that place: uploaded under the account, addressed by a `https://github.com/user-attachments/assets/…` URL, never committed to this repository, and not invalidated when the branch is squashed or deleted.

GitHub accepts images and video here and rejects anything else with a `422` (`content_type is not included in the list of allowed content types`). A log, a diff, a JSON payload, or a link to a file that should live elsewhere: put it in the PR body as text or a repository file. This skill carries screenshots and recordings.

## Requirements

- The `gh` CLI, authenticated (`gh auth login`, or `GH_TOKEN` / `GITHUB_TOKEN` in the environment). `scripts/upload-github-attachment.mjs` prints one URL per file and nothing else.
- Node 22, which is the repository's floor.
- No `curl` and no `file` utility: the script uses `fetch` and maps a MIME type from the extension, so it runs on Windows as well as macOS and Linux.
- A token from `gh auth token` is a real credential. Never echo it, write it to a file, or paste it into a command you would show in the PR.

## Upload

Run from a checkout of the destination repository:

```sh
node .agents/skills/upload-github-attachment/scripts/upload-github-attachment.mjs .captures/head-dashboard.png
```

Several files in one call, with the destination repository named when the working directory cannot resolve one:

```sh
node .agents/skills/upload-github-attachment/scripts/upload-github-attachment.mjs \
  --repo moeru-ai/mukae \
  .captures/base-dashboard.png .captures/head-dashboard.png
```

The output is one URL per line, in the order the files were given. Embed an image as `![](URL)` and any other file as `[label](URL)`.

## Verification

1. An upload counts as successful only when the command exits 0 and printed a URL starting with `https://github.com/user-attachments/assets/`.
2. Use that URL for the file that produced it. Pair "before" and "after" URLs by the order of the arguments, then confirm by opening the PR.
3. Do not issue a `GET` or `HEAD` request against the returned URL to check it. Anonymous requests can answer 404 while the asset is fine and visible to signed-in readers.
4. After the PR exists, reopen it and verify each image renders where the body places it.

## When it fails

The endpoint is undocumented, so treat a rejected upload as a capability change rather than a local mistake: check that `gh auth status` is healthy and the account can read the target repository, then report the failure with the file list.

Do not fall back to committing PR-only images, and do not open a UI pull request with missing before/after evidence. Report the local paths in the body and stop, as `create-pr` describes.
