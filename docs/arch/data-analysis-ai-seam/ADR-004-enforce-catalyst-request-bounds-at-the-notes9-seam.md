# ADR-004: Enforce Catalyst's request bounds at the Notes9 seam, and size the repair round to fit them

- Status: accepted
- Date: 2026-08-08
- Supersedes: none

## Context

`POST /analysis/spec-author` on Catalyst declares hard bounds on its request
(`catalyst/api/analysis_spec.py:70-84`): `prompt` is `min_length=1,
max_length=4000` and `system` is `max_length=8000`. Pydantic enforces them, so a
violation is a 422 before any handler code runs. The route is otherwise
scrupulously fail-soft, it returns HTTP 200 with a structured
`clarificationNeeded` for an unreachable model and for an unparseable reply, and
it says so in its own docstring: "Always HTTP 200 for a well-formed request".
The 422 is the one door out of that promise, and it opens on request shape.

Catalyst knows this and tests it: `catalyst/tests/test_analysis_spec_router.py`
carries `test_oversized_system_is_4xx`. The bound is enforced and asserted on one
side of the seam.

Notes9 does not know those numbers exist.

`app/api/data-analysis/spec-author/route.ts` validates that a prompt is present
and non-empty (`:157-163`) and never validates its length. Nothing upstream does
either: there is no `maxLength` anywhere in `components/data-analysis/`, so
`aiPrompt` is an unbounded textarea. `SPEC_AUTHOR_SYSTEM_PROMPT` measures 2110
characters today, comfortably inside the 8000 cap, but nothing asserts that and
it is edited by hand.

When a bound is breached, `callCatalyst` throws `CatalystHttpError(422)`
(`lib/catalyst-client.ts:159-165`). 422 is not in `RETRY_STATUS` (`502`, `503`),
so it propagates, and the route's catch turns anything that is not
`CatalystUnavailableError` into `outcome: "unavailable"` with the text "The
analysis assistant is unreachable right now. Your analysis is unaffected; try
the request again shortly" (`:238-247`). The researcher is told the backend is
down and to retry. Retrying sends the same over-long prompt and fails the same
way. The one thing that would fix it, shortening the request, is the one thing
the message does not say.

The repair round makes this sharper rather than rarer. `repairPrompt`
(`:123-136`) rebuilds the prompt as the original text plus a fixed ~430-character
scaffold plus, per rejected mutation, `JSON.stringify(mutation)` and its reason.
Mutations are not small: `SpecMutationSchema`
(`lib/data-analysis/spec/mutation-schema.ts:43+`) is a ~27-branch union whose
branches carry `annotation` objects, `patch` objects, `filters` and `seriesKey`,
so a rejected `figure.addAnnotation` serializes to hundreds of characters. The
repair fires precisely when `patch.rejected.length > patch.mutations.length`
(`:349`), that is, when the rejection list is long. Long rejection list, long
repair prompt, and `MAX_MUTATIONS` is 40. The affordance is at its most likely
to breach 4000 characters in exactly the case it was built for, and when it does
the failure is swallowed by the repair round's own catch (`:365-368`), logged to
the server console, and invisible to the user. The first, mostly-rejected answer
stands, which reads as "the assistant refused most of your request" rather than
"the retry never left the building".

One smaller thing found in the same read: the per-call timeout is
`Math.max(0, deadline - Date.now())` (`:232`). Zero is a legal value for
`setTimeout`, so an exhausted budget starts a fetch and aborts it on the next
macrotask instead of not starting it. The first call cannot hit this (the
deadline is fresh) and the repair call is guarded by `REPAIR_MIN_MS`, so it is
currently unreachable, but it is a floor that reads as a guard and is not one.

## Decision

The seam owns the backend's bounds. Notes9 checks them before the request
leaves, reports a breach as what it is, and constructs the repair round to fit
rather than hoping it does.

Three parts.

**Bound the prompt where it is authored, and again where it is sent.** The
composer gets a character cap with a visible counter near the limit. The route
independently rejects an over-long prompt with the existing `bad-request`
outcome and a reason that says what to do, because the route is explicit that
the UI is not its only caller. The cap lives in one exported constant next to
`SPEC_AUTHOR_SYSTEM_PROMPT` so the two repos have one number, not two.

**Budget the repair prompt instead of concatenating it.** `repairPrompt` takes
the remaining character budget and fills it with as many rejected mutations as
fit, most-recently-rejected first, appending a plain count of how many were
elided. A repair prompt that cannot fit even one rejection is not sent, and the
first answer stands, which is today's behaviour made deliberate. Truncation here
is safe in a way it is not elsewhere: the bundle already carries the contract and
the legal test set, so the rejection list is a hint about what failed, not the
specification.

**Stop mapping 422 to "unavailable".** `CatalystHttpError` with a 4xx status is a
request this deployment built wrong, and it becomes `outcome: "bad-request"`
with a reason naming the field. 5xx and transport failures keep the existing
"unavailable" text, unchanged, because for those the advice to retry is correct.
`SpecPatchOutcome` already carries `bad-request`, so the client union does not
move.

The zero-timeout floor is fixed in the same pass: below `REPAIR_MIN_MS` of
remaining budget, do not call.

## Consequences

Buys: the failure a researcher can fix says how to fix it, the repair round can
actually run in the case it exists for, and the route's "always 200 for a
well-formed request" promise stops being contradicted by a shape it never
checked. The bound becomes a number in the codebase rather than a fact in a
Python file the frontend never reads.

Costs: one shared constant that must be kept equal to a pydantic
`max_length` in another repo, which is a real coupling and the reason the
verification below asserts it rather than trusting it. Truncating the rejection
list means a repair round can be told about fewer failures than occurred, which
is strictly better than being told about none because the request 422'd.

Forecloses: nothing structural. If the bound moves, it moves in two places, and
the test says which two.

Known ceiling, stated plainly: this validates length, not tokens. A 3999-character
prompt is accepted and could still be expensive. The `_MAX_BUNDLE_CHARS` cap of
20000 on the Catalyst side is the matching control for the bundle and is
unchanged here.

## Alternatives rejected

**Raise `max_length` on Catalyst until the problem stops happening.** One line,
no frontend change. Rejected: it moves the cliff without adding a guardrail, and
the caller still would not know where the new cliff is or what to say when it
hits it. The bound is not the bug. The bug is that one side enforces a contract
the other side has never been told about.

**Retry 422 in `callCatalyst`.** Rejected outright. 422 is deterministic on
request shape, so retrying is guaranteed to fail identically, twice as slowly,
and `RETRY_STATUS` is correct to exclude it.

**Let the repair round keep failing, since the first answer still stands.**
Defensible, and it is today's behaviour. Rejected because the swallowed 422 is
indistinguishable in the UI from a model that legitimately had nothing better to
offer, and the repair round was built specifically so a researcher sees a plan
instead of a list of refusals.
