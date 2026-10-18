# Pull request body template

A decision guide, not a form. `## Summary` and `## Verification` always apply. Every other section earns its place by making this change easier to review. Write no filler to fill a heading.

## Summary

The problem or capability first, the result second, the reason for this approach third.

- What behavior changed, for a person or a system?
- Why does this change belong in one pull request?
- If it stacks on another branch, name the parent and leave inherited changes out.

## Change map

When a responsibility moves across modules. Not a file list. Name modules, not paths.

| Module | Before | After | Description |
| --- | --- | --- | --- |
| `<module or boundary>` | `<previous behavior>` | `<new behavior>` | `<why>` |

A small tree only when it makes the scope easier to read:

```text
<area>/
├── <owner>/     # what this part is responsible for
└── <boundary>/  # what it hands to the outside
```

## Architecture and behavior

Use a diagram when it is faster than prose. Render it to SVG with Pele and embed the image pinned to a commit, with the Mermaid source collapsed below it ([diagrams.md](diagrams.md)). Pick one shape:

A cross-module change is a flowchart. Label arrows with the call or the data.

![Flowchart: Caller, Outside, Owner, Store](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/.github/pr-diagrams/<branch>/flowchart.svg?sanitize=true)

<details><summary>Mermaid source</summary>

    flowchart LR
      Caller -->|request| Owner
      Owner -->|persist| Store
      Outside -->|event| Owner

</details>

Ordering, async work, or cleanup is a sequence. Match each `alt` branch to a branch in the code.

![Sequence: Caller, Owner, Outside with a failure branch](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/.github/pr-diagrams/<branch>/sequence.svg?sanitize=true)

<details><summary>Mermaid source</summary>

    sequenceDiagram
      participant C as Caller
      participant O as Owner
      participant X as Outside

      C->>O: request
      O->>X: do the work
      alt the work fails
        X-->>O: failure
        O-->>C: mapped error, cleanup done
      else the work succeeds
        X-->>O: result
        O-->>C: result
      end

</details>

Changed transitions or terminal states are a state diagram. Name the event on each arrow.

![State: Pending to Done or Abandoned](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/.github/pr-diagrams/<branch>/state.svg?sanitize=true)

<details><summary>Mermaid source</summary>

    stateDiagram-v2
      [*] --> Pending
      Pending --> Done: the completing event
      Pending --> Abandoned: the giving-up event
      Done --> [*]

</details>

For a fix, show a before pair and an after pair that use the same participants, then state the step that changed. When a reviewer would expect a diagram and none applies: `Not applicable: this change does not change runtime flow.`

## Boundaries and risks

Only risks this diff creates.

| Invariant or boundary | Failure mode | Protection | Evidence or gap |
| --- | --- | --- | --- |
| `<required behavior>` | `<how it fails>` | `<what guards it>` | `<test, runtime evidence, or unverified>` |

Check the groups this diff can actually touch:

- Credentials: what the change accepts, what it authorizes, and what happens when it is expired, replayed, or from another account.
- A flow a person completes: a code or link reused, forwarded, or approved after the request is gone.
- Persistence: data a later build, or a rollback, would read.
- Ordering and cleanup: cancellation, a dropped connection, a partial write.
- What a log line or an error body can contain.
- UI states: loading, empty, failed, and the narrow viewport, when the change is visible.

Mark an open question `Not verified`.

## Verification

The commands, and what they printed.

- A focused test proves the behavior it exercises.
- A build proves the static check.
- A screenshot proves only the page that was on screen.
- List what stayed unverified.

## Visual changes

A before/after pair for each page whose appearance this diff changes. Produce the images first ([visual-evidence.md](visual-evidence.md)) and upload each one.

| Before | After |
| --- | --- |
| ![](before-url) | ![](after-url) |
| `<page, state, viewport>` | `<page, state, viewport>` |

`Absent` for a page the change adds. `Removed` for one it deletes. A page that could not be captured is listed with the reason.

## Rollout and follow-up

Migrations, gates, or a required follow-up. State whether a gap blocks the merge.
