# Data Analysis AI seam: tagged datasets and contract bounds

Scope: the AI features of the Data Analysis surface only. The duplicated search
entry, maximising the grid and the graph, chart-settings navigation and hotkeys
are from the same review and are deliberately not designed here.

PR target: `dev` in `Notes9`, `dev` in `AI`. Both repos change; `AI` ships first.

ADRs: [001 taggable kind](./ADR-001-data-file-is-a-taggable-kind.md) ·
[002 mention rail](./ADR-002-the-dataset-rides-the-existing-mention-rail.md) ·
[003 seed before autoSend](./ADR-003-seed-mentions-before-autosend.md) ·
[004 request bounds](./ADR-004-enforce-catalyst-request-bounds-at-the-notes9-seam.md)

## What is actually wrong

**The Data Analysis chat cannot reference the data.** Catalyst already supports
`data_file` as a fetchable, citable, scope-enforced entity end to end, but not as
a *taggable* one, and Notes9 has no way to produce the tag even if it did. The
symptom in the review, that the chat never shows which file is tagged, is
downstream of this. Nothing is ever tagged, so there is nothing to show, and the
fix is not an indicator.

**The spec-author seam breaks its own fail-soft promise on request shape.**
Catalyst caps `prompt` at 4000 characters and `system` at 8000 and tests it.
Notes9 knows neither number, caps neither, and turns the resulting 422 into "the
analysis assistant is unreachable, try again shortly", which is both wrong and
unactionable. The one-shot repair round concatenates every rejected mutation and
fires only when the rejection list is long, so it breaches the cap most reliably
in the exact case it was built to rescue, where the 422 is caught, logged to a
server console, and shown to nobody.

**A third problem exists only once the first is fixed.** The sidebar's launch
handler submits an `autoSend` turn one animation frame before it seeds a
launch's mention chip. No producer sets both today, so it has never fired, but
the Data Analysis composer always sets `autoSend: true` and would be the first.
Wired naively, turn one goes out untagged and the chip appears afterwards
attached to nothing. See ADR-003.

## Recommended design

One shape. There is no genuine option set for the bounds problem (a caller must
respect the callee's declared limits) and the alternatives for the tagging
problem are recorded and rejected in ADR-001 and ADR-002.

**1. `data_file` joins the tagged-record allowlist.** One string on the Catalyst
side, because `_preflight_focused_records` forwards the attachment kind verbatim
as `entity_type` to `FetchFullRecordsTool`, where `data_file` is already a
complete citizen: table mapping, a field list that reads `tabular_format` and
withholds storage paths, an `uploaded_by` ownership branch in `_enforce_scope`, a
`dat` citation prefix, and both directions of the `experiment_has_data_file`
edge. Notes9 adds the matching mention kind, path, and catalog query.

**2. The dataset rides the existing mention rail.**
`CatalystLaunchDetail.literatureMention` generalizes to
`mention: { kind, id, title }`, and the sidebar consumer forwards that kind to
`appendMentionToInput`, which is already generic, already dedupes, already
renders a removable per-kind chip, and already feeds `selectedMentions`. The Data
page passes the `sourceFile` it already tracks.

**3. Mentions are seeded before `autoSend` submits**, so a launch's tags are on
the request its `autoSend` produces.

**4. The spec-author seam enforces Catalyst's bounds.** One shared constant, a
route-level `bad-request` for a breach, a repair prompt that fills a character
budget rather than concatenating without limit, and a 4xx that reports itself as
a bad request instead of an outage.

## Component boundaries and data flow

```
Data page (app/(app)/data-analysis/page.tsx)
  └─ DataHub → DataAnalysisWorkspace
       ├─ sourceFile {id, experimentId} :916 · sheetFileName :661   [exists]
       │
       ├─ CatalystSectionHero  (a LAUNCHER, not a composer)
       │    └─ dispatchAsk → CatalystLaunchDetail{query, autoSend:true,
       │                                          mention}          [ADR-002]
       │         └─ openCatalystPanel(launch)  ── CustomEvent ──┐
       │                                                        │
       └─ AI overlay (spec prompt)                              │
            └─ requestSpecPatch                                 │
                 └─ POST /api/data-analysis/spec-author  [ADR-004]
                      └─ callCatalyst("/analysis/spec-author")  │
                           └─ SpecAuthorRequest{bundle,prompt,system}
                                                                │
RightSidebar launch handler ◄───────────────────────────────────┘
  one rAF, ordered:  setQuery → appendMentionToInput(…) → autoSend  [ADR-003]
       └─ selectedMentions  (the agent's source of truth)
            └─ tagsToAttachments() → agentStream.runStream({attachments})
                 └─ Catalyst /notes9/agent
                      └─ _preflight_focused_records                [ADR-001]
                           └─ FetchFullRecordsTool(entity_type="data_file")
                                └─ experiment_data.tabular_format
                                     └─ <focused_resources> + citation
```

The two AI paths stay separate and that separation is load-bearing. The composer
answers questions and changes nothing; the spec prompt proposes a patch the
researcher approves before anything is applied. Nothing here lets one become the
other.

## Interfaces other slices must honor

Copy these verbatim into every slice brief. Parallel worktrees cannot see each
other's code, so this section is the only contract keeping them compatible.

### I1. Catalyst attachment allowlist (`AI`, `catalyst/core/contracts/request.py`)

```python
ATTACHMENT_KINDS = (
    "lab_note",
    "literature_review",
    "protocol",
    "experiment",
    "project",
    "sample",
    "report",
    "data_file",          # NEW
)
```

Nothing else in that file changes. The validator, the field and the error text
stay as they are, and nothing downstream needs a branch:
`_preflight_focused_records` (`core/agent.py:976-993`) groups by kind and
forwards it as `entity_type`.

### I2. Notes9 mention kind (`Notes9`, `lib/catalyst-mention-types.ts`)

```ts
export type CatalystMentionKind =
  | 'experiment' | 'project' | 'protocol' | 'lab_note'
  | 'literature_review' | 'sample'
  | 'data_file'                                    // NEW

// catalystMentionPath addition:
case 'data_file': return `/data-analysis?file=${encodeURIComponent(id)}`
```

The literal `'data_file'` must equal I1's allowlist entry exactly. It travels on
the wire as `attachments[].kind`.

### I3. Mention catalog query (`Notes9`, `components/layout/right-sidebar.tsx:1307`)

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

`file_name`, not `name` or `title`. `experiment_data` has no `name` column;
selecting one errors at runtime and the `catch` drops the whole catalog, which
silently disables every @-mention in the app.

### I4. Launch mention field (`Notes9`, `lib/catalyst-launch.ts`)

```ts
// REPLACES literatureMention?: { id: string; title: string }
mention?: {
  kind: CatalystMentionKind
  id: string
  title: string
}
```

Producers to migrate, both passing `kind: 'literature_review'` explicitly:

- `lib/catalyst-launch.ts:225`
- `components/literature-reviews/literature-pdf-panel.tsx:220`

Both currently set `autoSend: false` and must continue to.

Consumer to migrate: `components/layout/right-sidebar.tsx:3538-3560`, which today
hardcodes `kind: 'literature_review'` at `:3558`. It forwards `mention.kind`
instead. `appendMentionToInput` (`:1619`) already accepts
`{ kind: CatalystMentionKind; id: string; title: string }` and needs no change.

### I5. Launch ordering invariant (`Notes9`, `components/layout/right-sidebar.tsx`)

Inside one `requestAnimationFrame`, in this order:

```
1. set the composer query text        (today: rAF #1, ~:3529)
2. appendMentionToInput(mention)      (today: rAF #2, ~:3548-3560)
3. if (launch.autoSend) submit        (today: rAF #1, ~:3532)
```

The invariant, which the test asserts: **a launch's mentions are on the request
its `autoSend` produces.** Step 2 must stay after step 1, because
`appendMentionToInput` appends into a composer that already holds its text; that
is why the mention frame is late today and reversing the two frames naively
reintroduces the bug the current ordering was written to solve.

### I6. Composer pass-through prop (`Notes9`, `components/catalyst/catalyst-section-hero.tsx`)

One optional prop, placed onto the `CatalystLaunchDetail` that `dispatchAsk`
builds (~`:156-200`, before `openCatalystPanel(launch)`):

```ts
mention?: { kind: CatalystMentionKind; id: string; title: string }
```

All eight existing callers omit it and must behave byte-identically. The hero
also has a `router.push('/catalyst?…')` branch taken only when already on
`/catalyst`; the Data page is not, so it is out of this feature's path, but the
prop must not break it.

### I7. Data page wiring (`Notes9`, `components/data-analysis/data-analysis-workspace.tsx:3308`)

```tsx
<CatalystSectionHero
  scope="lab"
  placeholder="Ask Catalyst to analyze your data, pick a chart, or explain a result…"
  requiresDataReason={aiReady ? null : "Import a data file or type some data first…"}
  mention={
    sourceFile
      ? { kind: 'data_file', id: sourceFile.id, title: sheetFileName }
      : undefined
  }
/>
```

`sourceFile` is at `:916`, `sheetFileName` at `:661`. `requiresDataReason` keeps
its current meaning and is not merged with `mention`: it answers "can this page
take a question at all", `mention` answers "which record does the question point
at". A hand-typed sheet has no `sourceFile` and seeds nothing, correctly.

### I8. Spec-author bounds (`Notes9`)

```ts
// lib/data-analysis/ai/spec-author.ts — exported, single source of truth.
// Mirrors SpecAuthorRequest in AI/catalyst/api/analysis_spec.py:70-84.
export const SPEC_AUTHOR_PROMPT_MAX_CHARS = 4000
export const SPEC_AUTHOR_SYSTEM_MAX_CHARS = 8000
```

Route behaviour (`app/api/data-analysis/spec-author/route.ts`):

- `prompt.length > SPEC_AUTHOR_PROMPT_MAX_CHARS` →
  `400 { outcome: "bad-request", reason: "That request is too long. Shorten it to
  4000 characters or fewer." }`, before any Catalyst call.
- `repairPrompt(prompt, rejected, budget)` gains a third parameter, includes
  rejections most-recent-first while they fit, appends
  `"…and N more were rejected."` when it elides, and returns `null` when not even
  one fits; the caller then skips the repair round.
- the `catch` around `ask()`: `CatalystHttpError` with
  `status >= 400 && status < 500` returns
  `400 { outcome: "bad-request", reason: … }`. Everything else keeps the current
  `503 { outcome: "unavailable", … }` text verbatim.
- do not compute a timeout below `REPAIR_MIN_MS`. Today
  `Math.max(0, deadline - Date.now())` (`:232`) can start a fetch and abort it on
  the next macrotask.

`SpecPatchOutcome` in `lib/data-analysis/ai/spec-author-client.ts` does **not**
change. `bad-request` is already a union member and already handled.

## Slices

Three, in two waves. No two slices own the same file.

| | Repo | Owns | Wave |
|---|---|---|---|
| **A** | `AI` | I1 + its tests | 1 |
| **B** | `Notes9` | I8 + the prompt cap in the spec-prompt input | 1 |
| **C** | `Notes9` | I2–I7 + their tests | 2 |

A and B are disjoint (different repos, and B touches only
`lib/data-analysis/ai/`, `app/api/data-analysis/spec-author/`, and the `aiPrompt`
input) so they run together. C waits on A being deployed.

C is one slice rather than three because I2, I3, I4, I5 and the icon case all
land in `components/layout/right-sidebar.tsx`, and splitting them would put two
slices in the same file.

## Verification

1. **Allowlist containment** (`AI`, pytest, beside the existing tool-contract
   tests): every member of `ATTACHMENT_KINDS` is a key of `_ENTITY_TABLES` and
   has an `_ENTITY_FIELDS` entry. This is the guard for the
   two-lists-in-two-files coupling that caused this gap.
2. **Kind parity across repos** (`Notes9`, vitest in `__tests__/`, beside
   `agent-stream-contract.test.ts`): the `CatalystMentionKind` union is a subset
   of a checked-in copy of `ATTACHMENT_KINDS`, commented with
   `catalyst/core/contracts/request.py` as its source.
3. **`data_file` preflight** (`AI`, pytest): `{kind: "data_file", id}` reaches
   `FetchFullRecordsTool` with `entity_type="data_file"`, its `tabular_format`
   text appears in the focused-resources block, and a row outside the user's
   scope is dropped by `_enforce_scope`.
4. **Ordering invariant** (`Notes9`, vitest + RTL): a launch with
   `autoSend: true` and a mention produces a submitted request whose
   `attachments` contains that mention. This is the test that fails today.
5. **Seeding semantics** (`Notes9`, vitest + RTL): re-rendering with an equal
   seed leaves text and chips untouched; changing `sourceFile.id` replaces the
   chip; removing a chip does not bring it back.
6. **Prompt bound** (`Notes9`, in the existing
   `app/api/data-analysis/spec-author/route.test.ts`): 4001 characters returns
   `bad-request` and makes zero Catalyst calls; 4000 calls Catalyst once.
7. **Repair fits its budget** (same file): 40 rejected mutations each carrying an
   `annotation` payload produce a repair prompt within
   `SPEC_AUTHOR_PROMPT_MAX_CHARS` and a truthful elision count.
8. **4xx is not an outage** (same file): a mocked `CatalystHttpError(422)` yields
   `bad-request`; a mocked `503` still yields `unavailable` with today's text.
   Note the existing `"keeps the first answer when the repair call itself fails"`
   (`:374`) currently passes for the wrong reason, it asserts the swallow that
   hides the 422, and should be re-read when 8 lands.
9. **Literature regression** (`Notes9`, `/browse`): launch Catalyst from a
   literature PDF panel and from a paper card and confirm the literature chip
   still seeds. This is I4's blast radius.
10. **Runtime** (`/browse`, because typecheck and tests are not runtime-correct):
    import a file in Data Analysis, confirm a chip with that file name appears in
    the sidebar composer, confirm the auto-sent first turn's answer cites the
    file, load a second file and confirm the chip switches, remove the chip and
    confirm it stays removed across a send. Then paste a >4000-character prompt
    into the spec prompt and confirm the message says to shorten it rather than
    that the assistant is unreachable.

Runners: `pnpm typecheck && pnpm test` in `Notes9`, the `AI` suite from
`AI/.venv` (system python has langchain conflicts). Neither is claimed passing
without the runner output.

## Sequencing and rollback

`AI` deploys before `Notes9`. Until `ATTACHMENT_KINDS` contains `data_file`, a
Notes9 client that sends one receives a pydantic 422 that fails the **entire**
agent request including every other attachment on it, not a dropped tag.
Shipping in the wrong order breaks every tagged conversation, not only the new
one. Slice A is additive and safe alone: accepting a kind no client yet sends
changes nothing observable, so it can go out and sit.

Rollback is per-slice. Reverting I3 removes data files from the @-menu and leaves
I6's prop harmlessly unused. Reverting I7 leaves the tag available manually.
Slice B touches a disjoint file set and reverts on its own schedule. I5 is the
one change that is not trivially revertible in isolation, because I7 depends on
it; revert them together.

No migration, no env var, no schema change, no new dependency. Two ordinary
deploys in a fixed order.

## What this does not do

The `_ENTITY_TABLES` / `ATTACHMENT_KINDS` divergence closes for `data_file` only.
`paper` and `sample_file` stay fetchable-but-not-taggable, `sample_file`
deliberately, since its `_enforce_scope` branch is owner-only with the real check
at the SQL layer. Promoting either is a separate decision, and verification 1
will now make the divergence visible rather than silent.

The mention catalog keeps its `limit(120)` per table. `experiment_data` is the
highest-row-count of the six, so older files are not reachable by @-mention. The
Data page seeds its own file directly and so is unaffected; the other five tables
already accept the same ceiling.

Nothing here addresses the four non-AI items from the same review. Worth knowing
before anyone designs that work: the shortcuts infrastructure the hotkeys item
would build on already exists (`components/shortcuts/command-palette.tsx`,
`shortcuts-dialog.tsx`).
