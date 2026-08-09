# ADR-003: Seed a launch's mention before `autoSend` submits, not in a later frame

- Status: accepted
- Date: 2026-08-08
- Supersedes: none

## Context

The sidebar's launch handler does two independent things with a
`CatalystLaunchDetail`, in two separate animation frames.

`launch.autoSend` submits the turn. It is handled first, around
`components/layout/right-sidebar.tsx:3532`, calling `handleSubmitRef.current()`
inside a `requestAnimationFrame` so the query text has landed in the composer.

`launch.literatureMention` seeds the tag chip. It is handled second, around
`:3548-3560`, in a `requestAnimationFrame` whose own comment says it is queued
*after* the query frame above so it appends to a composer that already has its
text.

Each is individually correct. Together they are not: a launch carrying both
submits the turn in frame one and appends the chip in frame two. The request
goes out without the tag, and the chip then appears in the composer attached to
nothing.

This has never fired, because no producer sets both. Both existing
`literatureMention` producers (`lib/catalyst-launch.ts:225` and
`components/literature-reviews/literature-pdf-panel.tsx:220`) set
`autoSend: false`, so the user types and sends manually, by which time the chip
exists.

ADR-002 changes that. `CatalystSectionHero.dispatchAsk` always sets
`autoSend: true`, so the Data Analysis composer is the first producer in the
codebase to combine a mention with an auto-submitted turn. Wiring ADR-002
without touching this ordering ships a feature whose first turn is untagged and
which then displays a chip claiming otherwise. That is strictly worse than
today's honest silence: an answer that never saw the file, labelled as though it
did.

The ordering is not incidental, it is load-bearing in one direction. The mention
frame is deliberately late so it appends into a composer that already holds the
query text, and reversing the two frames naively would break that.

## Decision

Mentions are seeded in the same frame as the query text and strictly before
`autoSend` submits. The submit moves to the end of that frame rather than the
mention moving earlier into an empty composer.

Concretely, the handler collapses to one ordered sequence inside a single
`requestAnimationFrame`: set the query text, append every mention from
`launch.mention`, then, if `launch.autoSend`, submit. `selectedMentions` is
updated by `appendMentionToInput` synchronously as part of that append, so the
submit reads a composer whose text and tags are both final.

The invariant this establishes, and which the test asserts, is stated once and
belongs to the launch contract rather than to any caller: **a launch's mentions
are on the request that a launch's `autoSend` produces.** No producer should have
to know about frame scheduling to get a tagged first turn, and today one would.

## Consequences

Buys: ADR-002 becomes implementable, and the first turn from the Data page is
tagged, which is the entire point of the feature. It also removes a latent trap
for every future producer, since "set `autoSend` and a mention" is the obvious
thing to write and currently the wrong thing to write, silently.

Costs: it touches the launch handler, which is shared by every Catalyst entry
point in the app, so the blast radius is wider than the feature that motivated
it. The literature launch paths do not change behaviour (they set
`autoSend: false`, so the sequence they exercise is unchanged), but they are the
regression surface and are checked explicitly.

Forecloses: nothing. If a caller ever genuinely wants to submit before its tags
land, that is a new flag on the launch, not the default.

Known ceiling: this fixes ordering within a single launch. It does not make the
composer's tag state transactional, so a user who types into the sidebar during
the same frame as an incoming launch can still interleave. That has always been
true and is not made worse here.

## Alternatives rejected

**Have `CatalystSectionHero` set `autoSend: false` when it carries a mention.**
One line, entirely local to the new caller, and it genuinely avoids the bug.
Rejected because it fixes the path the ticket names and leaves the trap armed for
the next producer, and because it changes the Data page's behaviour for the
worse: the researcher presses send and the message does not send, which is a
second bug traded for the first.

**Seed the mention in an earlier frame, before the query text.** Symmetric and
smaller-looking. Rejected because the existing comment documents why the mention
frame is late: it appends into a composer that already holds its text, and
inverting that reintroduces the problem the current ordering was written to
solve.

**Await a microtask between the two frames inside `autoSend`.** Rejected as the
kind of fix someone decodes at 3am. It makes correctness depend on scheduler
timing rather than on sequence, and it would still be a coincidence rather than
an invariant.

**Leave it and document the hazard for producers.** Rejected. A contract that
requires every caller to know about frame ordering to avoid silently dropping
data is not a contract, and the failure is invisible at the call site.
