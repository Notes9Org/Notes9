# Slice N03: data-page-wiring

## Goal

The Data Analysis page tags the dataset it already has loaded, so the chat shows
which file every turn was grounded in. When this is done, opening the Catalyst
composer on that page arrives with the loaded file already tagged as a removable
chip, switching the loaded file switches the chip, and the spec-prompt textarea
is capped at the length the backend actually accepts.

## Owns (you may write ONLY these)

- `components/catalyst/catalyst-section-hero.tsx`
- `components/data-analysis/data-analysis-workspace.tsx`

Touching anything outside this list is a bug. If you believe you must, stop and
report it instead. You do **not** own `lib/catalyst-launch.ts`,
`lib/catalyst-mention-types.ts`, `components/layout/right-sidebar.tsx`, or
`lib/data-analysis/ai/spec-author.ts`. All four land before you start and you
consume them.

## Context

The Data Analysis workspace already knows which file is loaded. It tracks
`sourceFile: { id, experimentId } | null` at
`components/data-analysis/data-analysis-workspace.tsx:916` and `sheetFileName` at
`:661`. What it does not do is tell anyone: the Catalyst composer is mounted at
`:3308` with `scope="lab"`, a placeholder and a `requiresDataReason`, and nothing
identifying the data. So a researcher asks Catalyst about "this data" and the
agent receives no reference to it, and the chat cannot display which file is
tagged because nothing is tagged.

The important thing to understand before you edit `catalyst-section-hero.tsx`:
**the hero is not a composer, it is a launcher.** `dispatchAsk` builds a
`CatalystLaunchDetail`, calls `openCatalystPanel(launch)`, and clears its own
input. The persistent composer, the chips and the tag state all live in the right
sidebar, on the far side of a CustomEvent boundary. So the tag is not held here;
it is *passed through* on the launch, and the sidebar seeds it. An earlier design
proposed holding pre-set mentions in this component and was rejected for exactly
this reason (ADR-002). Do not add local tag state.

`dispatchAsk` always sets `autoSend: true`. A sibling slice has already fixed the
launch handler so a launch's mentions are appended before its `autoSend` submits;
before that fix the first turn went out untagged. You are relying on that
invariant, so if your test shows an untagged first turn, that is a real
regression in the shared handler, not something to work around here.

Separately, the spec-prompt textarea in this workspace (`aiPrompt`, around
`:1834`) is unbounded, while the backend refuses a prompt over 4000 characters
with a 422. A sibling slice made the route refuse it cleanly and exported the
number; this slice stops the researcher from typing past it in the first place.

## Interfaces you must honor

### Consume: the launch mention field

Already present in `lib/catalyst-launch.ts` when you start:

```ts
mention?: {
  kind: CatalystMentionKind
  id: string
  title: string
}
```

### Produce: the hero pass-through prop

One optional prop, placed onto the `CatalystLaunchDetail` that `dispatchAsk`
builds (around `:156-200`, before `openCatalystPanel(launch)`):

```ts
mention?: { kind: CatalystMentionKind; id: string; title: string }
```

It is a pass-through and nothing more: no local state, no normalization, no
default. All eight existing callers of `CatalystSectionHero` omit it and **must
behave byte-identically**. The component also has a
`router.push('/catalyst?…')` branch taken only when already on `/catalyst`; the
Data page is not, so it is outside this feature's path, but your change must not
break it.

### Produce: the Data page wiring

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

`requiresDataReason` keeps its current meaning and is **not** merged with
`mention`. It answers "can this page take a question at all"; `mention` answers
"which record does this question point at". Collapsing them would make removing a
tag look like breaking the page.

### Consume: the prompt bound

```ts
import { SPEC_AUTHOR_PROMPT_MAX_CHARS } from '@/lib/data-analysis/ai/spec-author'
```

Apply it as `maxLength` on the spec-prompt input, with a character counter that
appears as the limit is approached. Do not redefine the number locally; the
export is the single source of truth and mirrors a pydantic `max_length` in the
other repo.

## Depends on

- **N01 spec-author-bounds** — exports `SPEC_AUTHOR_PROMPT_MAX_CHARS`.
- **N02 mention-rail** — provides `mention` on the launch detail, `data_file` as a
  `CatalystMentionKind`, and the ordering fix your first turn depends on.

## Done when

- [ ] Opening the composer with a file loaded arrives with that file tagged.
- [ ] The chip is removable, and removing it does not break the page or the
      `requiresDataReason` gate.
- [ ] Loading a different file replaces the chip; typing and sending do not.
- [ ] A hand-typed sheet with no `sourceFile` seeds nothing.
- [ ] The spec prompt cannot exceed `SPEC_AUTHOR_PROMPT_MAX_CHARS`.
- [ ] All other `CatalystSectionHero` callers are unchanged in behaviour.
- [ ] Tests pass, with the runner output pasted. "Should pass" fails the gate.
- [ ] Docs updated for what changed and why.

## Edge cases to test

1. **Seeding does not clobber typing** (verification 5). Typing in a composer
   that has a mention and then re-rendering with an *equal* mention leaves both
   the text and the chips untouched. The dependency must be keyed on the seed
   identity (`kind:id`), never on object identity, or every render wipes the
   researcher's input. This is the single most likely way to get this wrong.
2. **Changing the file replaces the chip** (verification 5). A new
   `sourceFile.id` swaps the chip for the new file. Guaranteed behaviour: a stale
   chip pointing at the previous file is a wrong answer wearing a confident
   label, which is the exact failure this feature exists to prevent.
3. **Removal sticks** (verification 5). Removing the chip and re-rendering with
   an unchanged `sourceFile` does not bring it back. Seeding is a default, not a
   lock.
4. **No file, no tag.** A hand-typed sheet has `sourceFile === null` and seeds
   nothing. Guaranteed behaviour: there is no row for the backend to fetch, so a
   tag would point at nothing.
5. **`requiresDataReason` is independent.** With `aiReady` false the composer is
   blocked regardless of `mention`; with `aiReady` true and no mention it is
   usable. Assert both directions, so the two concerns cannot be accidentally
   coupled by a later edit.
6. **Existing callers unaffected.** A `CatalystSectionHero` rendered without
   `mention` produces a launch detail with no `mention` key, not
   `mention: undefined` inside an object other code inspects. Assert the emitted
   launch detail for at least one existing caller's props.
7. **Prompt cap, at and over.** The input accepts exactly
   `SPEC_AUTHOR_PROMPT_MAX_CHARS` characters and refuses the next one, and the
   counter reflects the real remaining count. An off-by-one here refuses a valid
   request.
8. **Cap is imported, not redefined.** Assert the component uses the exported
   constant. A locally-copied `4000` passes every behavioural test above and
   silently drifts the moment the backend bound changes.

## Out of scope

- Local tag state in `CatalystSectionHero`. The hero clears itself and hands off;
  the sidebar owns the composer. If you find yourself storing mentions here,
  re-read the Context section.
- Any change to `lib/catalyst-launch.ts`, `lib/catalyst-mention-types.ts`, or
  `components/layout/right-sidebar.tsx`. N02 owns all three. If the `mention`
  field does not behave as documented above, stop and report it rather than
  patching around it here.
- Any change to the spec-author route or its constants. N01 owns those; you only
  import.
- Persisting a removed chip across a page reload. Seeding is client state, so a
  reload re-seeds. That is correct for a default and deliberately not built.
- The four non-AI Data Analysis review items (duplicated search entry, maximise
  for grid and graph, chart-settings navigation, hotkeys). Not designed yet, and
  not this slice, even though two of them touch this file.
- Runtime verification in a browser. That is a later pipeline step, not this
  gate.
