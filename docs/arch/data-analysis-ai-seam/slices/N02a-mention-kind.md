# Slice N02a: mention-kind

## Goal

`data_file` becomes a valid Catalyst mention kind in the type system, with a route
and a test that permanently prevents this app from emitting a kind the backend
would reject. When this is done, `CatalystMentionKind` includes `'data_file'`,
`catalystMentionPath` routes it, and a parity test pins the union to the
backend's allowlist.

This slice is **purely additive**. It changes no behaviour and no runtime path.
Nothing consumes the new kind yet; slice N02b does that.

## Owns (you may write ONLY these)

- `lib/catalyst-mention-types.ts`
- `__tests__/catalyst-mention-kinds.test.ts`   (new file)

Touching anything outside this list is a bug. If you believe you must, stop and
report it instead. In particular you do **not** own `lib/catalyst-launch.ts`,
`components/layout/right-sidebar.tsx`, or
`components/literature-reviews/literature-pdf-panel.tsx`. Slice N02b owns all
three and renames a field in the first of them; do not anticipate that rename
here.

## Context

The Data Analysis workspace has a Catalyst composer, and a researcher looking at
a loaded spreadsheet cannot make Catalyst see that file. The reported symptom is
that the chat never displays which file is tagged. The cause is that nothing is
ever tagged.

The Catalyst backend already treats a data file as a complete first-class entity:
`fetch_full_records` maps `data_file` to the `experiment_data` table, selects its
pre-parsed `tabular_format` text while withholding storage paths, and
`_enforce_scope` knows that table's ownership column is `uploaded_by` rather than
`created_by`. Sibling slice A01 in the `AI` repo added `"data_file"` to the
backend's `ATTACHMENT_KINDS` allowlist and **has already merged** (AI-service
PR #80), so the backend accepts the kind today.

This slice adds the client-side type so the rest of the work has something to
refer to. It is deliberately small and deliberately inert.

The cross-repo hazard worth knowing: `ATTACHMENT_KINDS` (backend) and this app's
`CatalystMentionKind` are two lists in two repos that must agree. If this app
ever emits a kind the backend does not accept, the backend's pydantic validator
raises and the result is a **422 that fails the entire agent request**, including
every other attachment on it, not a dropped tag. The parity test below is the
guard for that, and it is the main reason this slice exists separately.

## Interfaces you must honor

```ts
// lib/catalyst-mention-types.ts
export type CatalystMentionKind =
  | 'experiment' | 'project' | 'protocol' | 'lab_note'
  | 'literature_review' | 'sample'
  | 'data_file'                                    // NEW

// catalystMentionPath addition, matching the existing cases' shape:
case 'data_file': return `/data-analysis?file=${encodeURIComponent(id)}`
```

Add the union member and the path case. Change nothing else in the file: the
existing members, their order, the existing path cases and the MIME constant all
stay exactly as they are.

The literal `'data_file'` is a cross-repo wire contract. It travels as
`attachments[].kind` and must equal the backend allowlist entry exactly. Do not
rename it, alias it, or convert the union to an enum.

Slice N02b consumes `CatalystMentionKind` including this member and cannot see
your code, so the member name is what it compiles against.

## Depends on

Nothing in this repo. Backend slice A01 has already merged, so the kind is
accepted server-side.

## Done when

- [ ] `'data_file'` is a member of `CatalystMentionKind`.
- [ ] `catalystMentionPath('data_file', id)` returns the encoded Data Analysis route.
- [ ] A parity test fails if this app's union ever gains a kind the backend does
      not accept.
- [ ] `npx tsc --noEmit` is clean.
- [ ] Tests pass, with the runner output pasted. "Should pass" fails the gate.
- [ ] Docs updated for what changed and why.

## Edge cases to test

Put these in `__tests__/catalyst-mention-kinds.test.ts`, beside the existing
`agent-stream-contract.test.ts`, which is the precedent for a cross-repo contract
test in this repo. Read it first and match its style.

Assert on behaviour and values, never by checking that a source file contains a
string. A previous attempt at the larger version of this slice passed its suite
by grepping source and shipped a completely broken feature.

1. **Kind parity across repos.** Check in a copy of the backend's
   `ATTACHMENT_KINDS` as a literal array, commented with
   `AI/catalyst/core/contracts/request.py` as its source, and assert every member
   of `CatalystMentionKind` is in it. Guaranteed behaviour: a kind this app can
   emit is always a kind the backend accepts, so no tag can 422 the whole
   request. Derive the union's members in a way that fails to compile if someone
   adds a member without updating the test (a `Record<CatalystMentionKind, true>`
   exhaustive map is the usual trick), rather than hand-listing them.
2. **`data_file` routes correctly.** `catalystMentionPath('data_file', id)`
   returns `/data-analysis?file=<id>`.
3. **Ids are URL-encoded.** An id containing a character needing encoding comes
   back encoded, matching what the existing cases do. Guaranteed behaviour: the
   new case must not be the one that forgets `encodeURIComponent`.
4. **Existing kinds unchanged.** Every pre-existing kind still returns exactly the
   path it returned before. This slice is additive and this is the regression
   guard proving it.

## Out of scope

- The `literatureMention` to `mention` rename on `CatalystLaunchDetail`. Slice
  N02b does it, atomically with its consumer, so the literature chip never has a
  window where producers and consumer disagree.
- The `experiment_data` mention-catalog query, the `mentionIconMarkup` case, and
  the launch-handler ordering fix. All three live in
  `components/layout/right-sidebar.tsx`, which N02b owns.
- Any component change at all. Nothing renders this kind yet, and that is
  correct for this slice.
- Runtime verification in a browser. That is a later pipeline step, not this
  gate.
