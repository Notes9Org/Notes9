# Slice N02b: mention-rail

## Goal

The launch detail carries a kind-bearing `mention` instead of a literature-only
one, data files become @-mention candidates, and a launch's tags are guaranteed
to be on the request its `autoSend` produces. When this is done, the Data
Analysis composer (slice N03) can hand Catalyst the loaded file and have it
arrive on the very first turn.

## Owns (you may write ONLY these)

- `lib/catalyst-launch.ts`
- `components/layout/right-sidebar.tsx`
- `components/literature-reviews/literature-pdf-panel.tsx`
- `__tests__/catalyst-launch-ordering.test.tsx`   (new file)

You do **not** own `lib/catalyst-mention-types.ts`. Slice N02a added
`'data_file'` to `CatalystMentionKind` and its path case; this slice branches
from N02a and consumes that.

## History (two prior attempts failed here; read before writing)

**Attempt 1 shipped a dead composer.** It collapsed the launch handler's two
animation frames but dropped the synchronous `setInput(q)` call. React state
stayed empty, `handleSubmit`'s early-return guard
`(!overrideText?.trim() && !input.trim() && ...)` around `:2394` fired, and **no
request was sent at all** for any `autoSend` launch, breaking every "Ask
Catalyst" composer on all eight pages. Its own tests passed anyway, because 5 of
10 edge cases asserted that a source file contained a string rather than that a
request was dispatched.

**Attempt 2 stalled twice** without writing a line, at roughly 1M tokens and 924
tool uses. `right-sidebar.tsx` is 5,339 lines, and rebuilding an understanding of
the launch handler, composer state, `handleSubmit`, the catalog and the icon map
consumed the whole budget before any edit. That is why this slice was cut down to
four files and why the exact anchors are given below.

## Context

The Catalyst backend already treats a data file as a first-class entity, and
slice A01 (AI-service PR #80, **merged**) added `"data_file"` to its
`ATTACHMENT_KINDS` allowlist, so the kind is accepted server-side today.

The rail you are generalizing already does the hard part.
`appendMentionToInput` (`:1619`) takes
`{ kind: CatalystMentionKind; id: string; title: string }`, dedupes on
`[data-caty-tag-id][data-caty-tag-kind]`, renders a removable chip via
`mentionIconMarkup`, calls `resizeInput()` itself, and updates
`selectedMentions` — which its own comment calls the agent's source of truth and
which `tagsToAttachments` turns into `attachments` on the request. Only the
launch field's name and shape are wrong: it hardcodes literature, and its
consumer hardcodes `kind: 'literature_review'`.

### The four edit sites (verified on current `dev`)

1. `lib/catalyst-launch.ts:74` — the `literatureMention` field on
   `CatalystLaunchDetail`.
2. `lib/catalyst-launch.ts:225` — producer #1 (`attachPaperToCatalyst`). Sets
   `autoSend: false`.
3. `components/literature-reviews/literature-pdf-panel.tsx:220` — producer #2.
   Sets `autoSend: false`.
4. `components/layout/right-sidebar.tsx`:
   - `:1320` — the mention catalog's `Promise.all` (five `supabase.from(...)`
     queries).
   - `:1596` — `mentionIconMarkup`, a `switch` over kind with a
     `ClipboardInfoIcon` default.
   - `:3510-3561` — the launch handler. This is the delicate part, below.

### The ordering constraint, in both directions

The handler currently reads, in essence:

```
const q = launch.query?.trim();
if (q) {
  setInput(q);                        // :3512  SYNCHRONOUS, outside the frame
  requestAnimationFrame(() => {       // frame 1
    if (inputRef.current) { inputRef.current.textContent = q; /* caret to end */ }
    inputRef.current?.focus();
    resizeInput();
    if (launch.autoSend) { handleSubmitRef.current?.(...) }   // :3532
  });
}
if (launch.literatureMention) {       // :3539  independent of `q`
  const m = launch.literatureMention;
  requestAnimationFrame(() => {       // frame 2, queued AFTER frame 1
    /* caret to end */
    appendMentionToInput({ kind: 'literature_review', id: m.id, title: m.title });
  });
}
```

Both orderings are load-bearing and you must satisfy both at once:

- **The chip must land after the text.** Assigning `inputRef.current.textContent`
  wipes an already-appended chip. This is why frame 2 is queued second, and the
  existing comment says so. Do not move the mention before the text.
- **`autoSend` must fire last.** `appendMentionToInput` is what updates
  `selectedMentions`, so a submit that runs before it sends the turn untagged.
  This is the bug being fixed.

So: **one frame, in the order text → chip → submit.** And `setInput(q)` stays
synchronous and outside the frame. Note the mention block is currently
independent of `q`, so a launch carrying a mention and no query must still seed
its chip.

## Interfaces you must honor

### The launch mention field

```ts
// lib/catalyst-launch.ts — REPLACES literatureMention?: { id: string; title: string }
mention?: {
  kind: CatalystMentionKind
  id: string
  title: string
}
```

Both producers pass `kind: 'literature_review'` explicitly and keep
`autoSend: false`. The consumer forwards `mention.kind` instead of hardcoding
one. Slice N03 sets this field from `CatalystSectionHero`; its name and its three
property names are what N03 compiles against.

### The mention catalog query

Sixth entry in the existing `Promise.all`, same limits and ordering as the other
five:

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

**`file_name`, not `name`.** `experiment_data` has no `name` column; selecting
one errors at runtime and the surrounding `catch` drops the whole catalog,
silently disabling every @-mention in the app.

### The ordering invariant

**A launch's mentions are on the request its `autoSend` produces.**

## Depends on

**N02a** — `'data_file'` as a `CatalystMentionKind`. Branch from N02a's branch,
not from `dev`.

## Done when

- [ ] `literatureMention` is gone; `mention` carries an explicit kind; both
      producers and the one consumer are migrated.
- [ ] Data files appear as @-mention candidates and produce a removable chip.
- [ ] A launch with `autoSend: true` and a mention produces a submitted request
      whose `attachments` contains that mention.
- [ ] Launching Catalyst from a literature PDF panel and from a paper card still
      seeds the literature chip.
- [ ] `npx tsc --noEmit` clean; tests pass with runner output pasted.
- [ ] Docs updated for what changed and why.

## Edge cases to test

Assert observable behaviour: a rendered chip, a dispatched request, a state
value. Checking that a source file *contains* a string is a grep, not a test, and
is how attempt 1 shipped a broken composer.

1. **Ordering invariant.** A launch with `autoSend: true` and a mention produces
   a submitted request whose `attachments` contains it. **Must fail against
   unmodified `dev` and pass after the change** — run it both ways and report
   both.
2. **The regression attempt 1 shipped.** A plain launch with a query, `autoSend:
   true` and no mention still produces a request **carrying that query**. Assert
   the dispatched query string, not merely that submit was called: a submit that
   early-returns on empty `input` also "calls submit".
3. **Chip survives the text seeding.** A launch with both a query and a mention
   ends with the chip present in the composer. This is the constraint the old
   two-frame ordering existed to satisfy; collapsing the frames must not
   reintroduce `textContent` wiping the chip.
4. **Mention with no query.** A launch with a mention and no `query` still seeds
   its chip. The mention block is currently independent of `q`.
5. **Mention with no autoSend.** Chip seeded, nothing submitted. This is the path
   both literature producers take.
6. **Literature regression.** Both migrated producers still seed a
   `literature_review` chip with the right id and title.
7. **Missing `file_name`.** A null `file_name` maps to `'Untitled data file'`.
8. **Catalog failure is contained.** If the `experiment_data` query rejects, the
   existing `catch` still leaves the previously-loaded list in place. Adding a
   sixth query must not make all five others fail together.
9. **Chip dedupe across kinds.** A `data_file` and a `lab_note` sharing an id
   produce two chips, not one. `appendMentionToInput` dedupes on kind *and* id.
10. **Icon case.** `mentionIconMarkup` handles `data_file`. It falls back to
    `ClipboardInfoIcon`, so this is polish; assert the chip renders an icon.

## Out of scope

- `lib/catalyst-mention-types.ts` (N02a owns it) and
  `components/catalyst/catalyst-section-hero.tsx` /
  `components/data-analysis/data-analysis-workspace.tsx` (N03 owns them).
- Widening the catalog's `limit(120)`. Older files being unreachable by
  @-mention is an accepted ceiling; the Data page seeds its own file directly.
- Making composer tag state transactional against concurrent user typing. Always
  been possible, not made worse.
- Runtime browser verification. A later pipeline step.
