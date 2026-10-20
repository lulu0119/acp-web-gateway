---
name: ux
description: Rules for how Exterior's web surfaces must read and behave. Each rule names one defect shape (`no-*`) with the evidence that proves it, the shapes that do not count, and the fix. Use when building, changing, or reviewing any relay page (sign-in, consent, device approval, dashboard), the desktop window, or a web app surface (list, dialog, empty/loading/error state, button, shortcut). A full audit of one surface is `ux-audit`.
---

# ux

Exterior's pages ask a person to trust something: approve a device, let a web app reach an agent, revoke an app. They act on what the screen says. So the bar is not "looks fine". The bar is: **what the screen says is true, the important part reads first, every action answers, and the context the user built survives.**

The rules are defect shapes, not a checklist of features. A rule fires only when its evidence is in hand. Instances from this repository live in [references/cases.md](references/cases.md), keyed by rule name; the rules themselves stay free of file names. Which button variant to use is in [references/buttons.md](references/buttons.md).

## Principles

| Principle | Means | Rules |
| --- | --- | --- |
| **Truthful** | Unknown, missing, failed, and absent are different statements. Never print one as another. | `no-unknown-as-absent`, `no-silent-drop`, `no-shared-failure`, `no-dead-end-state` |
| **Prioritized** | The surface answers its main question first. Space, size, weight, and color follow information value. | `no-arbitrary-space`, `no-flat-hierarchy`, `no-buried-answer`, `no-equal-weight-noise`, `no-indistinct-identity` |
| **Continuous** | Selection, input, and view settings survive refresh, reload, and navigation. Two surfaces never disagree about one fact. | `no-lost-context`, `no-inconsistent-readout` |
| **Consequential** | Every affordance looks actionable, answers at once, has a durable effect, reports its real outcome, and does not steal input meant for something else. | `no-inert-action`, `no-false-feedback`, `no-input-hijack` |

When two rules conflict, prefer Truthful over Prioritized over Continuous over Consequential. A clean, prioritized screen that states something false is worse than a cluttered true one.

## Evidence layers

A finding is valid only from a layer that can see it.

- **L1 code**: missing branches, swallowed errors, state that is never persisted.
- **L2 render**: hierarchy, space, color, identity, what a state actually looks like. Requires the running page with realistic data.
- **L3 drive**: transitions, timing, focus, keys, forced failures.

Each rule lists its minimum layer. A rule whose minimum layer did not run is reported as **not checked**, never as passing.

## Rules

### no-unknown-as-absent

**Defect.** A loading, failed, missing, or unreadable source is shown as empty, zero, "No items", or a negative fact.

**Prove it.** L1: the path from the failure or 401 to the render, ending in `[]`, `0`, or an empty-state component. L3: force the failure and capture the screen.

**High signal.** A loader that returns early on `!response.ok` and leaves the list empty. `?? []` or `?? 0` before an empty check. A placeholder that never resolves to an error.

**Not a finding.** The source really loaded and really contains nothing, and the copy says so.

**Fix.** Keep `loading | ready | error` apart through to the render. A true empty state says what is empty and offers the action that fills it.

### no-silent-drop

**Defect.** Records are skipped, truncated, capped, or hidden by a default filter, and the count or list reads as complete.

**Prove it.** L1: a skip, cap, or default filter with no consumer that reports how much it removed.

**High signal.** A list that shows only online items under a heading that names all of them. A row cap stated only in a tooltip.

**Not a finding.** A user-set filter whose state is visible next to the count.

**Fix.** Show what was removed and why ("+3 offline", "+18 more").

### no-shared-failure

**Defect.** One failing source blanks, replaces, or poisons data that does not depend on it.

**Prove it.** L1: an error from one source written to state that gates other sources. L3: break one source and capture the others.

**High signal.** A failed refresh replacing an already loaded list with a page-level error. One failing section taking down the page.

**Fix.** Scope the failure to its source. Keep already loaded data and say "refresh failed, showing data from <time>".

### no-dead-end-state

**Defect.** A loading, failed, or finished state has no way forward: no timeout, no retry, a retry that cannot succeed, or a success that does not say what to do next.

**Prove it.** L1: a load with no timeout; an unhandled server error that reaches the browser as a bare status; Retry offered for a deterministic failure. L2: a success page that names no next step.

**High signal.** A plain-text "Internal Server Error" after a form post. An expired approval link with no way to start again. "Approved" with no hint of where to go.

**Fix.** Time out slow reads. Offer Retry for transient failures, and a way to restart for expired ones; for deterministic ones, name the fix. A success page states the outcome with a clear mark and the next action.

### no-arbitrary-space

**Defect.** Padding, margin, or gap is off the spacing scale, or a card's four sides do not share one padding step.

**Prove it.** L1: a spacing class outside [references/spacing.md](references/spacing.md), or `px-*` and `py-*` on a card, row, dialog, or empty state.

**High signal.** `*-2.5`, `*-3.5`, `*-7`, or `px-* py-*` on a card.

**Not a finding.** A control, a page's larger bottom margin, or a full-bleed row, as that reference allows.

**Fix.** Use the spacing reference.

### no-flat-hierarchy

**Defect.** Text and sections carry the same size, weight, and color regardless of importance, so the eye has no entry point.

**Prove it.** L2 only. Measure the share of visible text per font size and weight ([ux-audit probes](../ux-audit/references/probes.md)). Code that sets `text-sm` is a hint, not proof.

**High signal.** Over 80% of visible text in one or two sizes within 2px of each other at regular weight. A heading that wraps a raw URL at display size.

**Fix.** Use three text levels (title, body, metadata) and reserve the smallest for metadata.

### no-buried-answer

**Defect.** The surface does not lead with the answer to its main question. The user has to hunt for it.

**Prove it.** L2: write the surface's main question (see `ux-audit` product notes), then locate its answer on the default screen. Report where it is, how large it is, and how many actions it takes to reach.

**High signal.** A consent page whose first line is an identifier, with what the app may do in small text below. An action for a section placed at the bottom of the page instead of in that section.

**Fix.** Put the answer first, and put each action next to the thing it acts on.

### no-equal-weight-noise

**Defect.** Low-value content gets the same space and treatment as signal.

**Prove it.** L2: count empty, zero, or repeated rows on the default screen against rows that matter.

**High signal.** Zero counters styled like real ones. One fact printed in several places. Copy that restates what the visual already shows.

**Fix.** Collapse empty parts behind a count. Print each fact once, at the level it belongs to.

### no-indistinct-identity

**Defect.** Entities cannot be told apart, or raw identifiers appear where a human name exists.

**Prove it.** L2: two entities with the same label in one view. L1: rendering an id when a name, origin, or icon is available.

**High signal.** A client id as the subject of a sentence. A device known only by a generated id.

**Fix.** Show names, origins, and icons; keep raw ids as secondary text or behind copy.

### no-lost-context

**Defect.** Work the user built is discarded by reload, refresh, or navigation.

**Prove it.** L1: state held only in memory with no persistence and no URL encoding. L3: build state, reload, and capture.

**High signal.** A typed code lost after a failed submit. A chosen tab that resets on reload.

**Fix.** Encode the shareable part in the URL. Persist per-viewer settings in guarded local storage. Keep form input across a validation error.

### no-inconsistent-readout

**Defect.** Two surfaces show different values for the same fact at the same moment.

**Prove it.** L1: two code paths that compute the same quantity differently. L3: both readouts captured at once.

**High signal.** A count in a header that disagrees with the list below it. An approval that succeeded while the list still lacks the item.

**Fix.** Compute the value once and share it.

### no-inert-action

**Defect.** An affordance changes something that does not persist and has no downstream effect.

**Prove it.** L1: trace the action to its end: no persistence, no request, nothing another surface reads.

**Not a finding.** Ephemeral view controls such as expand or scroll.

**Fix.** Give the action an outcome, or remove it.

### no-false-feedback

**Defect.** The feedback about an action does not match what happened: no feedback while it runs, or a message that differs from the outcome.

**Prove it.** L1: the branch that produces the message and the condition that actually occurred; a button whose handler awaits a request with no pending state. L3: click and capture the button during the request.

**High signal.** A failed request swallowed while the list reloads as if it succeeded. A button that can be pressed twice while its request runs. A clickable control without a pointer cursor, hover, or pressed state.

**Fix.** Report the real outcome and reason. While an action runs, show a pending state on the control that started it and disable it.

### no-input-hijack

**Defect.** A handler consumes a key or gesture that the focused control or the platform needs.

**Prove it.** L1: a window-level handler that calls `preventDefault` without checking the focused element's role. L3: focus the control, press the key, and observe both effects.

**High signal.** A code field that blocks paste. Enter in a field submitting the wrong form.

**Fix.** Scope handlers to the surface that owns them, and skip them when focus is on a button, link, list, or text field.

## Adding or changing a rule

Add a rule only when a defect generalizes beyond one surface **and** no existing rule covers it. Prefer widening an existing rule's high-signal shapes. Keep the set small enough to read in one pass; merge before adding.

A rule must keep this shape: **Defect** (one sentence), **Prove it** (minimum layer and the evidence), **High signal**, optional **Not a finding**, **Fix**. Keep file paths out of rules; put them in [references/cases.md](references/cases.md) under the rule's name.
