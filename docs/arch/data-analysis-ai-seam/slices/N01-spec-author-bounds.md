# Slice N01: spec-author-bounds

## Goal

The Data Analysis spec-author route stops reporting its own malformed requests as
a backend outage. When this is done, an over-long prompt is refused with an
actionable message before any model call, the one-shot repair round is built to
fit the backend's declared limit instead of blowing past it, and a 4xx from
Catalyst is reported as a bad request rather than "the assistant is unreachable".

## Owns (you may write ONLY these)

- `lib/data-analysis/ai/spec-author.ts`
- `app/api/data-analysis/spec-author/**`

Touching anything outside this list is a bug. If you believe you must, stop and
report it instead. In particular you do **not** own
`components/data-analysis/data-analysis-workspace.tsx` or
`lib/data-analysis/ai/spec-author-client.ts`.

## Context

`POST /analysis/spec-author` on the Catalyst backend declares hard bounds by
pydantic: `prompt` is `min_length=1, max_length=4000` and `system` is
`max_length=8000`. A violation is a 422 raised before any handler code runs.
Catalyst knows this and tests it (`test_oversized_system_is_4xx`).

The route in this repo is otherwise scrupulously fail-soft. Its own docstring
promises "Always HTTP 200 for a well-formed request", and it delivers that for an
unreachable model and for an unparseable reply, both of which come back as a
structured `clarificationNeeded`. The 422 is the one door out of that promise,
and it opens on request shape.

Notes9 does not know those numbers exist. The route validates that a prompt is
present and non-empty and never validates its length. When a bound is breached,
`callCatalyst` throws `CatalystHttpError(422)`; 422 is not in `RETRY_STATUS`
(which is `502`, `503`), so it propagates, and the route's catch turns anything
that is not `CatalystUnavailableError` into `outcome: "unavailable"` with "The
analysis assistant is unreachable right now. Your analysis is unaffected; try the
request again shortly." The researcher is told the backend is down and to retry.
Retrying sends the same over-long prompt and fails identically. The one thing
that would fix it, shortening the request, is the one thing the message does not
say.

The repair round makes this sharper rather than rarer. `repairPrompt` rebuilds
the prompt as the original text, plus a fixed scaffold of roughly 430 characters,
plus, per rejected mutation, `JSON.stringify(mutation)` and its rejection reason.
Mutations are not small: `SpecMutationSchema` in
`lib/data-analysis/spec/mutation-schema.ts` is a roughly 27-branch union whose
branches carry `annotation` objects, `patch` objects, `filters` and `seriesKey`,
so a rejected `figure.addAnnotation` serializes to hundreds of characters, and
`MAX_MUTATIONS` is 40. The repair fires precisely when
`patch.rejected.length > patch.mutations.length`, that is, when the rejection
list is long. Long rejection list, long repair prompt. The affordance is at its
most likely to breach 4000 characters in exactly the case it was built for, and
when it does the failure is swallowed by the repair round's own catch, logged to
a server console, and invisible to the user. It reads as "the assistant refused
most of your request" rather than "the retry never left the building".

One smaller thing in the same file: the per-call timeout is
`Math.max(0, deadline - Date.now())`. Zero is a legal `setTimeout` value, so an
exhausted budget starts a fetch and aborts it on the next macrotask instead of
not starting it. It is currently unreachable (the first call has a fresh deadline
and the repair call is guarded by `REPAIR_MIN_MS`), but it is a floor that reads
as a guard and is not one.

This is ADR-004. Its central point: the bound is not the bug. The bug is that one
side enforces a contract the other side has never been told about. Raising the
cap on the backend was considered and rejected because it moves the cliff without
adding a guardrail.

## Interfaces you must honor

```ts
// lib/data-analysis/ai/spec-author.ts — exported, the single source of truth.
// Mirrors SpecAuthorRequest in the AI repo at catalyst/api/analysis_spec.py:70-84.
export const SPEC_AUTHOR_PROMPT_MAX_CHARS = 4000
export const SPEC_AUTHOR_SYSTEM_MAX_CHARS = 8000
```

Both constants must be exported by name. A sibling slice imports
`SPEC_AUTHOR_PROMPT_MAX_CHARS` to cap a textarea and will fail to build if you
rename it, inline it, or move it to another module. Comment each with the
pydantic field it mirrors so the coupling is visible at the definition.

Route behaviour in `app/api/data-analysis/spec-author/route.ts`:

- `prompt.length > SPEC_AUTHOR_PROMPT_MAX_CHARS` returns
  `400 { outcome: "bad-request", reason: "That request is too long. Shorten it to
  4000 characters or fewer." }`, before any Catalyst call. Place it beside the
  existing empty-prompt check, which already returns `bad-request`.
- `repairPrompt(prompt, rejected, budget)` gains a third parameter. It includes
  rejections most-recently-rejected first while they fit inside `budget`, appends
  `"…and N more were rejected."` when it elides any, and returns `null` when not
  even one rejection fits. The caller skips the repair round on `null`.
- The `catch` around `ask()`: a `CatalystHttpError` with
  `status >= 400 && status < 500` returns
  `400 { outcome: "bad-request", reason: <names the field> }`. Everything else,
  including `CatalystUnavailableError`, 5xx and transport failures, keeps the
  current `503 { outcome: "unavailable", … }` text **verbatim** — for those, the
  advice to retry is correct and the existing wording is deliberate.
- Do not compute a timeout below `REPAIR_MIN_MS`. Below that remaining budget, do
  not make the call at all.

`SpecPatchOutcome` in `lib/data-analysis/ai/spec-author-client.ts` does **not**
change and you do not own it. `bad-request` is already a member of that union and
is already handled by the caller, which is why this slice needs no client edit.

## Depends on

Nothing. Runs in wave 1.

## Done when

- [ ] An over-long prompt is refused with an actionable message and zero Catalyst
      calls.
- [ ] The repair prompt is bounded by the shared constant and reports truthfully
      how many rejections it left out.
- [ ] A 4xx surfaces as `bad-request`; a 5xx still surfaces as `unavailable` with
      unchanged wording.
- [ ] Tests pass, with the runner output pasted. "Should pass" fails the gate.
- [ ] Docs updated for what changed and why.

## Edge cases to test

`app/api/data-analysis/spec-author/route.test.ts` already exists (472 lines) and
already covers the repair round thoroughly. Add to it rather than starting a new
file. Note that its existing case `"keeps the first answer when the repair call
itself fails"` currently passes for the wrong reason: it asserts the swallow that
hides the 422. Re-read it once your changes land and adjust it to assert the new,
correct reason.

1. **Prompt bound, over** (verification 6). A 4001-character prompt returns
   `outcome: "bad-request"` and makes **zero** Catalyst calls. Assert the call
   count, not just the response.
2. **Prompt bound, at** (verification 6). A 4000-character prompt calls Catalyst
   exactly once. The boundary must be inclusive; off-by-one here means a valid
   request is refused.
3. **Repair fits its budget** (verification 7). 40 rejected mutations each
   carrying an `annotation` payload produce a repair prompt of at most
   `SPEC_AUTHOR_PROMPT_MAX_CHARS` characters. Build the fixture from the real
   `SpecMutationSchema` shape, not from a toy `{kind: "x"}` object, or the test
   will not reproduce the failure.
4. **Elision count is truthful** (verification 7). When rejections are elided,
   the appended count equals the number actually left out. A test asserting only
   the length bound would pass on a repair prompt that lies.
5. **Repair skipped when nothing fits** (verification 7). With a prompt near the
   cap and one enormous rejection, `repairPrompt` returns `null`, no second
   Catalyst call is made, and the first answer stands.
6. **4xx is not an outage** (verification 8). A mocked `CatalystHttpError(422)`
   yields `outcome: "bad-request"`.
7. **5xx is still an outage** (verification 8). A mocked `503` still yields
   `outcome: "unavailable"` with today's exact text. This is a regression guard:
   the fix must not turn a real outage into a client error.
8. **Timeout floor.** With remaining budget below `REPAIR_MIN_MS`, no call is
   made. Guaranteed behaviour: no fetch is started and immediately aborted, and
   an exhausted budget never surfaces as a generic transport error.

## Out of scope

- The `maxLength` and character counter on the spec-prompt textarea. That lives
  in `components/data-analysis/data-analysis-workspace.tsx`, which a sibling
  slice owns and is editing right now. It imports your constant, so export it
  correctly and stop there. The route is the trust boundary and is where
  enforcement has to be regardless.
- Raising or changing the bounds themselves. 4000 and 8000 mirror pydantic
  `max_length` values in another repo; changing them is a separate cross-repo
  decision.
- Retrying 422 in `callCatalyst`. 422 is deterministic on request shape, so a
  retry is guaranteed to fail identically. `RETRY_STATUS` is correct as it
  stands, and you do not own that file.
- Token-level accounting. This validates length, not tokens. Say so in the code
  comment rather than building it.
- Anything to do with `data_file` tagging or the Catalyst composer. Different
  slices, disjoint files.
- Runtime verification in a browser. That is a later pipeline step, not this
  gate.
