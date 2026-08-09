# Slice N02: mention-rail

## Goal

A data file becomes a taggable record in the Catalyst chat, and a launch's tags
are guaranteed to be on the request its `autoSend` produces. When this is done,
`data_file` is a real `CatalystMentionKind`, data files appear in the @-mention
catalog, the launch detail carries a kind-bearing `mention` instead of a
literature-only one, and a launch that both seeds a mention and auto-submits no
longer sends the turn before the tag exists.

## Owns (you may write ONLY these)

- `lib/catalyst-mention-types.ts`
- `lib/catalyst-launch.ts`
- `components/layout/right-sidebar.tsx`
- `components/literature-reviews/literature-pdf-panel.tsx`
- `__tests__/catalyst-mention-kinds.test.ts`      (new file)
- `__tests__/catalyst-launch-ordering.test.tsx`   (new file)

Touching anything outside this list is a bug. If you believe you must, stop and
report it instead. In particular you do **not** own
`components/catalyst/catalyst-section-hero.tsx` or
`components/data-analysis/data-analysis-workspace.tsx`; a sibling slice is
editing both right now and consumes what you build here.

## Context

The Data Analysis workspace has a Catalyst composer, and a researcher looking at
a loaded spreadsheet cannot make Catalyst see that file. The reported symptom is
that the chat never displays which file is tagged. The cause is that nothing is
ever tagged.

The Catalyst backend already supports a data file as a complete first-class
entity: `fetch_full_records` maps `data_file` to the `experiment_data` table,
selects its pre-parsed `tabular_format` text while withholding storage paths, and
`_enforce_scope` already knows that table's ownership column is `uploaded_by`
rather than `created_by`. A sibling slice in the `AI` repo adds `"data_file"` to
the backend's `ATTACHMENT_KINDS` allowlist. **That repo deploys before this one**
— until it does, sending the kind produces a pydantic 422 that fails the entire
agent request including every other attachment on it.

Three things block it on this side. `CatalystMentionKind` has no `data_file`
branch. The @-mention catalog in `right-sidebar.tsx` queries five tables
(`literature_reviews`, `lab_notes`, `experiments`, `projects`, `protocols`) and
not `experiment_data`, so a data file never becomes a mention candidate. And the
launch detail's `literatureMention` field hardcodes literature in both its shape
and its consumer.

The rail you are generalizing already does everything else needed.
`appendMentionToInput` (around `:1619`) takes
`{ kind: CatalystMentionKind; id: string; title: string }`, dedupes on
`[data-caty-tag-id][data-caty-tag-kind]`, renders a removable chip via
`mentionIconMarkup`, and updates `selectedMentions`, which its own comment calls
the agent's source of truth. `selectedMentions` becomes `attachments` on the
request via `tagsToAttachments`. So the whole delivery path exists; only the
field's name and shape are wrong. It has two producers and one consumer, which is
small enough to fix properly rather than work around. This is ADR-002. The
rejected alternative was adding a parallel `datasetMention` field, which loses
because the next kind then adds a third.

**The ordering bug (ADR-003) is the part that will silently ruin this if you skip
it.** The launch handler does two independent things in two separate animation
frames. `launch.autoSend` submits the turn, handled first, around `:3532`, inside
a `requestAnimationFrame` so the query text has landed. `launch.literatureMention`
seeds the chip second, around `:3548-3560`, in a frame whose own comment says it
is queued *after* the query frame so it appends into a composer that already has
its text. Each is individually correct. Together they are not: a launch carrying
both submits in frame one and appends the chip in frame two, so the request goes
out untagged and the chip then appears attached to nothing.

This has never fired because no producer sets both — `lib/catalyst-launch.ts:225`
and `literature-pdf-panel.tsx:220` both set `autoSend: false`. The sibling slice
wiring the Data Analysis composer will be the first producer to set both, because
`CatalystSectionHero.dispatchAsk` always sets `autoSend: true`. Wired without
this fix, the feature ships with an untagged first turn and a chip claiming
otherwise, which is worse than the current honest silence.

Note the ordering is load-bearing in one direction: the mention frame is late *on
purpose* so it appends into a composer that already holds the query text. Do not
simply swap the two frames; that reintroduces the problem the current ordering
was written to solve.

## Interfaces you must honor

### The mention kind

```ts
// lib/catalyst-mention-types.ts
export type CatalystMentionKind =
  | 'experiment' | 'project' | 'protocol' | 'lab_note'
  | 'literature_review' | 'sample'
  | 'data_file'                                    // NEW

// catalystMentionPath addition:
case 'data_file': return `/data-analysis?file=${encodeURIComponent(id)}`
```

The literal `'data_file'` is a cross-repo wire contract: it travels as
`attachments[].kind` and must equal the backend allowlist entry exactly.

### The launch mention field

```ts
// lib/catalyst-launch.ts — REPLACES literatureMention?: { id: string; title: string }
mention?: {
  kind: CatalystMentionKind
  id: string
  title: string
}
```

Migrate both producers to pass `kind: 'literature_review'` explicitly:
`lib/catalyst-launch.ts:225` and
`components/literature-reviews/literature-pdf-panel.tsx:220`. Both currently set
`autoSend: false` and **must continue to**.

Migrate the consumer at `right-sidebar.tsx:3538-3560`, which today hardcodes
`kind: 'literature_review'` at `:3558`, to forward `mention.kind`.
`appendMentionToInput` already accepts any kind and needs no change.

A sibling slice sets this field from `CatalystSectionHero`. Its exact name
(`mention`) and the three property names are what that slice is being built
against right now; changing any of them silently breaks it.

### The mention catalog query

Sixth entry in the existing `Promise.all` around `:1307`, same limits and
ordering as the other five:

```ts
supabase.from('experiment_data')
  .select('id,file_name')
  .order('created_at', { ascending: false })
  .limit(120)
```

```ts
...(dataFiles ?? []).map((r: { id: string; file_name: string | null }) => ({
  kind: 'data_file' as const,
  id: r.id,
  title: r.file_name ?? 'Untitled data file',
}))
```

**`file_name`, not `name` or `title`.** `experiment_data` has no `name` column.
Selecting one errors at runtime and the surrounding `catch` drops the whole
catalog, which silently disables every @-mention in the app.

### The launch ordering invariant

Inside one `requestAnimationFrame`, in this order:

```
1. set the composer query text        (today: rAF #1, ~:3529)
2. appendMentionToInput(mention)      (today: rAF #2, ~:3548-3560)
3. if (launch.autoSend) submit        (today: rAF #1, ~:3532)
```

The invariant, which your test asserts: **a launch's mentions are on the request
its `autoSend` produces.** Step 2 stays after step 1. No producer should have to
know about frame scheduling to get a tagged first turn.

## Depends on

Nothing in this repo. Runs in wave 1, in parallel with the spec-author slice.

A sibling slice in the `AI` repo must be **deployed** before this ships to users,
but it is not a build dependency: nothing here needs that change to compile or to
pass its tests.

## Done when

- [ ] `data_file` is a `CatalystMentionKind` with a working mention path.
- [ ] Data files appear as @-mention candidates and produce a removable chip.
- [ ] `literatureMention` is gone; `mention` carries an explicit kind; both
      producers and the one consumer are migrated.
- [ ] A launch with `autoSend: true` and a mention produces a submitted request
      whose `attachments` contains that mention.
- [ ] Launching Catalyst from a literature PDF panel and from a paper card still
      seeds the literature chip.
- [ ] Tests pass, with the runner output pasted. "Should pass" fails the gate.
- [ ] Docs updated for what changed and why.

## Edge cases to test

1. **Kind parity across repos** (verification 2). The `CatalystMentionKind` union
   is a subset of a checked-in copy of the backend's `ATTACHMENT_KINDS`. Comment
   the copy with `catalyst/core/contracts/request.py` as its source. Put this in
   `__tests__/`, beside the existing `agent-stream-contract.test.ts` precedent.
   Guaranteed behaviour: a kind this app can emit is always a kind the backend
   accepts, so no tag can ever 422 the whole request.
2. **Ordering invariant** (verification 4). A launch with `autoSend: true` and a
   mention produces a submitted request whose `attachments` contains it. **This
   test fails today** — write it first and watch it fail, or you have not
   reproduced the bug you are fixing.
3. **Ordering with no mention.** A launch with `autoSend: true` and no mention
   still submits, with the query text present. Guaranteed behaviour: the
   collapse into one frame must not make the submit conditional on a mention
   existing.
4. **Ordering with a mention and no autoSend.** The chip is seeded and nothing is
   submitted. This is the path both existing literature producers take, so it is
   the regression guard for them.
5. **Literature regression** (verification 9). Both migrated producers still
   seed a `literature_review` chip with the right id and title. This is the blast
   radius of the rename and the most likely thing to break.
6. **Missing `file_name`.** A row with a null `file_name` maps to
   `'Untitled data file'` rather than an empty or `undefined` chip label.
7. **Catalog failure is contained.** If the `experiment_data` query rejects, the
   existing `catch` still leaves the previously-loaded mention list in place
   rather than clearing it. Guaranteed behaviour: adding a sixth query must not
   make all five others fail together. Assert against the existing behaviour, do
   not change it.
8. **Chip dedupe across kinds.** A `data_file` and a `lab_note` sharing an id
   produce two chips, not one. `appendMentionToInput` dedupes on kind *and* id,
   and a test on id alone would pass while the behaviour is wrong.
9. **Unknown kind is still dropped.** The existing guard that strips tags whose
   id is not in the live mention catalog still fires for a stale `data_file` tag.
   Guaranteed behaviour: a tag pointing at a deleted file is dropped rather than
   sent.
10. **Icon fallback.** `mentionIconMarkup` handles `data_file`. It falls back to
    `ClipboardInfoIcon` for unmapped kinds so this is polish, not correctness;
    add the case and assert the chip renders an icon at all.

## Out of scope

- `components/catalyst/catalyst-section-hero.tsx` and
  `components/data-analysis/data-analysis-workspace.tsx`. A sibling slice owns
  both and consumes your `mention` field.
- Widening the mention catalog's `limit(120)`. `experiment_data` is the
  highest-row-count of the six, so older files will not be reachable by
  @-mention. That ceiling is accepted deliberately: the Data page seeds its own
  file directly, and the other five tables already live with it.
- Adding `paper` or `sample_file` as mention kinds. Separate decisions.
- Making composer tag state transactional. This slice fixes ordering within a
  single launch, not interleaving with concurrent user typing, which has always
  been possible and is not made worse.
- Runtime verification in a browser. That is a later pipeline step, not this
  gate.
