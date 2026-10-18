# Diagrams

A pull request body embeds each diagram as an SVG image rendered with [Pele](https://pele.run), not as a ```` ```mermaid ```` block. The image looks the same wherever the body is read, and the Mermaid source stays next to it for review.

## Render

Write the Mermaid source to `.github/pr-diagrams/<branch>/<name>.mmd`, then render it:

```sh
node scripts/render-diagram.mjs .github/pr-diagrams/<branch>/<name>.mmd .github/pr-diagrams/<branch>/<name>.svg
```

The script also reads stdin and writes stdout when the paths are omitted. It inlines the colors from `packages/ui/src/styles.css` and paints a solid background, because an image cannot read page CSS and has to read on GitHub's light and dark themes. Open the SVG before committing it. A diagram Pele cannot parse fails the script with the parser's error.

## Embed

1. Commit the `.mmd` and `.svg` files on the branch and push.
2. Take the commit's full SHA with `git rev-parse HEAD`.
3. Reference the image pinned to that SHA. A branch URL breaks when the branch moves or is deleted. A repo-relative path does not resolve in a pull request body.

```markdown
![Flow from Caller through Owner to Store](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/.github/pr-diagrams/<branch>/<name>.svg?sanitize=true)

<details><summary>Mermaid source</summary>

    flowchart LR
      Caller -->|request| Owner

</details>
```

`?sanitize=true` makes GitHub serve the file as `image/svg+xml`. Without it the raw host serves `text/plain` and the image does not render. Indent the source in `<details>` instead of fencing it as `mermaid`, so GitHub shows the text and not a second rendering.

4. Reopen the pull request and confirm each image loads.

## Clean up

Remove `.github/pr-diagrams/<branch>/` in the last commit before merge. The pinned images keep loading: GitHub keeps every commit of a pull request reachable through `refs/pull/<number>/head`. The diagrams do not land on `main`.
