---
name: upload-github-attachment
description: Upload a local image or recording to GitHub user-attachments and print a URL Markdown can embed. Use when a pull request, issue, or comment should show a file that is not committed.
---

# upload-github-attachment

The file lives in GitHub's user-attachments storage. The repository does not keep it. The script accepts images and video. Anything else fails, and belongs in the body as text.

`gh` is authenticated (`gh auth login`, or `GH_TOKEN` / `GITHUB_TOKEN`). Run from a checkout of the destination repository:

```sh
node .agents/skills/upload-github-attachment/scripts/upload-github-attachment.mjs <file>...
```

Pass `--repo OWNER/REPO` when the working directory cannot resolve one. The script prints one `https://github.com/user-attachments/assets/...` URL per file, in argument order. Embed an image as `![](URL)`.

An upload succeeded when the command exits 0 and printed that URL. Use the URL for the file that produced it. Pair before and after by argument order. Do not request the URL to check it: an anonymous request can answer 404 while the file is visible to signed-in readers.

After the pull request exists, reopen it and confirm each image renders. If the upload fails, report the local paths. Leave the files uncommitted.
