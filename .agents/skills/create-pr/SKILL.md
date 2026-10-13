---
name: create-pr
description: Open a pull request whose body explains the changed system and, when a page's appearance changed, attaches a before/after pair for that page. Use when asked to open, create, publish, or prepare a PR from the current branch.
---

# create-pr

A reviewer reads the body before the diff. The body states what changed, what proves it, and — when a page looks different — the images to compare. Before is the merge base, not a memory of the old page.

`AGENTS.md` owns the repository's change rules. This skill is the pull request on top of them. The section shapes are in [the template](references/pr-body.md). Follow those shapes. Fill them from this diff, not from the template's placeholders.

## Workflow

1. Read the branch, the remotes, and the diff against the merge base with `git merge-base` and `git diff`. A branch with no commits of its own has nothing to open. Trace each changed file to its entry point, callers, and the state it owns.
2. Run the checks `AGENTS.md` requires for what changed. Record the commands and what they printed.
3. Compose the body from the template.
4. When a page's appearance changed, follow [visual evidence](references/visual-evidence.md) for that page and upload with `upload-github-attachment`. A diff with no rendered change has no images.
5. `gh pr create` with the title, base, and body. Reopen the pull request and confirm the title, base, tables, diagrams, and images.
6. On review comments, fix the confirmed error, rerun the focused check, push, and reply with what ran.

## Which sections

- `## Summary` and `## Verification` in every pull request.
- `## Change map` when more than one module or ownership boundary moved.
- `## Architecture and behavior` when a flowchart, a sequence, or a state diagram is faster than prose. Use the template's shape for that kind of change. A fix that changes a flow shows a before diagram and an after diagram.
- `## Boundaries and risks` when the change has a failure mode worth naming. Use the template's table.
- `## Visual changes` with one before/after pair per page whose appearance this diff changes.

A small change stays in prose. A diagram added only to fill the template is noise.

## Evidence

Say what a check proved.

- A focused test proves the behavior it exercises.
- The repository's build and test run prove static and unit checks.
- A screenshot proves the page that was on screen, at that viewport, with that data.

Leave "safe", "fixed", or "backward compatible" out unless the sentence names the evidence. Name anything still unverified.

Leave credentials and account rows out of the body. Open a screenshot before uploading it: the page shows the account's name and the devices.

If `gh` cannot open the pull request, report the branch, the commit range, and the body. If the images could not be uploaded, report their local paths.
