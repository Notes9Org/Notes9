# ADR-002: The active dataset rides the existing mention rail, generalized to carry its kind

- Status: accepted
- Date: 2026-08-08
- Supersedes: none (replaces an earlier draft of this ADR that proposed a new
  `defaultMentions` prop on `CatalystSectionHero`; that draft was never reviewed,
  never sliced and never implemented, and is corrected here rather than
  superseded)

## Context

ADR-001 makes `data_file` taggable. This decides how the Data Analysis surface
produces that tag, and it is the decision the review actually asks for: the chat
has to always show which file is tagged, because the researcher switches files
and switches content underneath a conversation that is already running.

The workspace already knows the answer. It tracks `sourceFile: { id,
experimentId } | null` for the row loaded into the sheet
(`components/data-analysis/data-analysis-workspace.tsx:916`) and `sheetFileName`
(`:661`). What it does not do is tell anyone: the composer is mounted with
`scope="lab"` and a placeholder and nothing else (`:3308`).

The first instinct is to give `CatalystSectionHero` a way to hold a pre-set tag.
That is wrong, and reading the component says why. The hero is not a composer, it
is a **launcher**: `dispatchAsk` builds a `CatalystLaunchDetail`, calls
`openCatalystPanel(launch)`, and clears its own input. The persistent composer,
the chips, and the tag state all live in the right sidebar. A pre-set tag held in
the hero would have to be re-implemented on the far side of an event boundary it
does not cross.

The rail that does cross it already exists. `CatalystLaunchDetail` carries
`literatureMention?: { id, title }`, and the sidebar's launch handler
(`components/layout/right-sidebar.tsx:3538-3560`) passes it to
`appendMentionToInput`, which is already generic over `CatalystMentionKind`,
already dedupes on `[data-caty-tag-id][data-caty-tag-kind]`, already renders a
removable chip with a per-kind icon, and already updates `selectedMentions`,
which its own comment calls the agent's source of truth. Everything ADR-002 needs
is built. The only thing wrong with the field is its name and its shape: it
hardcodes literature, and the consumer hardcodes `kind: 'literature_review'`
(`:3558`).

It has two producers (`lib/catalyst-launch.ts:225`,
`components/literature-reviews/literature-pdf-panel.tsx:220`) and one consumer.
That is small enough to fix properly rather than work around.

## Decision

`CatalystLaunchDetail.literatureMention` becomes
`mention?: { kind: CatalystMentionKind; id: string; title: string }`. Both
producers pass `kind: 'literature_review'` explicitly, the consumer forwards
`mention.kind` to `appendMentionToInput` instead of hardcoding one, and
`CatalystSectionHero` gains one optional pass-through prop that puts a caller's
mention onto the launch it builds.

The Data page then passes the file it already has:

```tsx
mention={sourceFile
  ? { kind: 'data_file', id: sourceFile.id, title: sheetFileName }
  : undefined}
```

Three rules govern the resulting chip, and they are what make this a tag rather
than a prefill.

It is removable. A researcher asking a general question with a file open must be
able to ask it. Seeding is a default, not a lock, and `appendMentionToInput`
already renders the removal affordance.

It re-seeds on `sourceFile.id` and only on `sourceFile.id`. Loading a second file
replaces it; typing, sending, or removing the chip does not bring it back. A
stale chip pointing at the previous file is a wrong answer wearing a confident
label, which is precisely the failure the review describes.

It is displayed per turn, not as a global indicator. Because
`appendMentionToInput` already feeds `selectedMentions`, and `selectedMentions`
already becomes `attachments` on the request, the tag is recorded against the
turn it was asked with. Scrolling back therefore shows what each individual
answer was grounded in. "Always display which file is tagged" is answered by a
per-turn record, not by one banner that only ever describes the present.

`requiresDataReason` is untouched and is not merged with this. It answers "can
this page take a question at all", the mention answers "which record does this
question point at", and collapsing them would make removing a tag look like
breaking the page. A sheet typed by hand has no `sourceFile`, so it seeds
nothing, which is correct: there is no row for Catalyst to fetch.

## Consequences

Buys: the reported gap closes at its root using the mechanism that already works
for lab notes and protocols, with no new state machine, no new persistence, and
no second way to attach a record. The generalization is a net simplification,
one field instead of a literature special case, so seeding an experiment or a
protocol from any other page is free afterwards.

Costs: a rename across three call sites in a path that currently works. The
literature launch flow is the regression risk and is named explicitly in the
verification section. The pass-through prop is one more optional prop on a
component used by eight pages, all of which must stay byte-identical when they
omit it.

Forecloses: it commits the product to tags being visible and removable. An
"always send the current page's context invisibly" design is off the table after
this, which is the intent. Invisible context is uncitable, unremovable, and
undebuggable.

Known ceiling: seeding is client state, so a chip the user removed is not
remembered across a reload and a reload re-seeds. Correct for a default, cheap to
change if it annoys anyone.

Depends on ADR-003. Seeding a mention onto a launch that also carries
`autoSend: true` is unsafe under the current ordering, and this decision is not
implementable without that one.

## Alternatives rejected

**A new `defaultMentions` prop on `CatalystSectionHero`** (the earlier draft of
this ADR). Rejected on reading the component: the hero clears itself and hands
off, so the prop would seed state on the wrong side of the event boundary and
need a second delivery mechanism to reach the sidebar, where a delivery mechanism
already exists. This is the brownfield failure mode of adding a second way to do
an existing thing.

**Add `datasetMention` beside `literatureMention`.** Zero risk to the literature
path, which is the honest argument for it. Rejected because the next kind adds a
third parallel field and the consumer grows a third near-identical branch. Two
producers and one consumer is small enough to generalize now, and it will not be
smaller later.

**A read-only banner above the chat naming the loaded file.** Smaller, and it
technically "displays which file is tagged". Rejected because it displays a claim
rather than a fact: the banner would assert the file is in play while Catalyst
still received nothing, which is worse than today's honest silence.

**Append the file name to the prompt text.** No contract change at all. Rejected:
a file name in prose is a string the model may or may not resolve to a record,
carrying no id, no scope check and no citation.
