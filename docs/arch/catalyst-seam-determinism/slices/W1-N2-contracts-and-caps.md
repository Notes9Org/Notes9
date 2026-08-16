# Slice W1-N2: n9-contracts-and-caps

## Goal

Notes9 stops disagreeing with Catalyst about four request caps, and the shared contract
becomes a package with a hash instead of a file people remember to keep in sync. When this
is done, `lib/__tests__/contract-notes9-catalyst.test.ts` is 8/8 green, the four caps come
from the shared fixture instead of hand-written constants, and a one-sided edit to either
repo's copy fails a test.

## Owns (you may write ONLY these)

- `contracts/**`
- `lib/seam/contracts/**`
- `lib/limits/config.ts`
- `lib/__tests__/contract-notes9-catalyst.test.ts`
- `lib/__tests__/contract-hash.test.ts`

Touching anything outside this list is a bug. If you believe you must, stop and report it
instead — another slice owns that file. In particular you do **not** own `.github/**`
(W1-N1 is creating CI right now) or any route under `app/api/**`.

## Context

The type checker stops at the repo boundary. `CONTRACTS.md` in this directory plus two
conformance tests are what replace it.

`contracts/notes9-catalyst.v1.json` already exists and is byte-identical with the AI repo's
copy — verified `sha256[0:16] = c304a8a0740658e0`. What does not exist is any mechanism
that notices when someone edits one copy and not the other. Both suites stay green. That is
the exact hole `CONTRACT_HASH` closes.

The four failing assertions are not a broken test. They are four real divergences live in
production right now:

```
expected 100000 to be 10000   (C1  query characters)
expected 400    to be 100     (C2  history items)
expected 200000 to be 100000  (C3  history[].content characters)
expected 50     to be 10      (C4  attachment items)
```

**Resolution rule: the smaller value wins.** This is not arbitrary and it is not a new
policy. Notes9 defaults `LIMITS_MODE` to `shadow`, so its guards log and do not block;
Catalyst's pydantic is therefore already the effective ceiling in production. A user over
the cap gets a raw upstream `422` instead of our own message. The smaller number is a
written-down description of what already happens.

**Do not make these green by editing the fixture upward.** That reintroduces the 422 and
converts a caught bug into a hidden one.

Note the compound bound that must be expressed and is not today: `query` is capped at
10,000 characters while `history[].content` allows 100,000 across 32 entries, giving a
~3.2 MB effective body through the history field. `limits.json` carries a
`total_request_bytes` cap that binds the whole envelope.

## Interfaces you must honor

### Produce: the contracts package (I1)

Vendored to `lib/seam/contracts/v1/`:

```
request.schema.json             # the seam envelope request
response.schema.json            # the seam envelope response
sse.events.schema.json          # all 20 event types, one vocabulary
facts.schema.json               # Fact / FactToken (ADR-010)
limits.json                     # every cap, ONE number each
CONTRACT_HASH                   # sha256 over the sorted concatenation of the above
```

`CONTRACT_HASH` is a sha256 over the **sorted concatenation** of the other five files.
The AI repo's W1-A1 computes it the same way over its own copies. Sorted, so filesystem
order cannot change the answer.

### Produce: caps read from the fixture, not retyped

`lib/limits/config.ts` must derive `QUERY_CHARS_MAX`, `HISTORY_ITEMS_MAX`,
`HISTORY_CONTENT_CHARS_MAX` and `ATTACHMENTS_ITEMS_MAX` from `limits.json`. A locally
retyped `10000` passes every behavioural test and silently drifts the moment the contract
moves — which is precisely the failure that produced C1–C4.

### Consume: nothing

This slice has no upstream. It is wave 1.

## Depends on

Nothing. Runs in parallel with W1-N1.

## Done when

- [ ] `npx vitest run lib/__tests__/contract-notes9-catalyst.test.ts` is **8 passed**, and
      it went green by narrowing Notes9, not by editing the fixture
- [ ] `lib/seam/contracts/v1/` exists with all six files
- [ ] `CONTRACT_HASH` recomputed from the local copies equals the stored value
- [ ] The four caps are read from `limits.json`; `grep` finds no retyped literal
- [ ] `limits.json` carries `total_request_bytes`
- [ ] `pnpm typecheck` clean
- [ ] Tests pass with the runner output pasted. "Should pass" fails the gate.
- [ ] Docs updated for what changed and why

## Edge cases to test

1. **A one-sided fixture edit fails.** Change one byte in a local contracts file, recompute,
   and assert `CONTRACT_HASH` no longer matches. Then restore and assert it does. A hash
   test that has never been observed to fail is a hash test that asserts nothing.
2. **Sorted concatenation is order-independent.** The hash is identical regardless of the
   order the directory is read in. Otherwise the two repos disagree for a reason that has
   nothing to do with the contract.
3. **Exactly at each cap, and one past.** A `query` of exactly 10,000 characters is
   accepted; 10,001 is rejected. Same for all four rows. An off-by-one here rejects a valid
   request, which is the user-visible harm this whole slice exists to remove.
4. **The compound bound is expressible.** `limits.json` carries `total_request_bytes`, and a
   payload under every individual cap can still exceed it — assert that arithmetic against
   the real exported constants, built from `history` entries since that is the ~3.2 MB path.
   Asserting the *rejection* is **not** yours: no guard for this bound exists in any file you
   own, and building one here would put enforcement in the wrong layer. W2-N1 owns the
   rejection; see Out of scope.
5. **Caps are imported, not redefined.** Assert `lib/limits/config.ts` resolves to the
   fixture values, and that changing `limits.json` changes what the module exports. A
   copied literal passes every test above.
6. **Failure mode — one repo deploys first.** Additive-within-major means either order is
   safe. Assert that a fixture whose major version matches but which carries an extra
   unknown field still validates. Guaranteed behaviour: accepted and preserved, never
   silently dropped.

   **This test must exercise real code.** Constructing two object literals and spreading one
   into the other proves only that JavaScript has spread semantics — it can never fail, no
   matter what Notes9 does, and it is worthless as a regression guard. The assertion must run
   through an actual parse/validate path, or against `request.schema.json` /
   `response.schema.json` themselves (e.g. that `additionalProperties` is not `false`). If no
   parsing path exists in a file you own, assert the schema property and say so plainly in
   the test name — do not dress up a tautology as a behavioural test.

## Out of scope

- Creating `.github/` or any CI workflow. W1-N1 owns that and now runs **after** you, because
  CI legitimately reports red until your four caps go green.
- **Enforcing `total_request_bytes`.** Carry the number in `limits.json` and assert the
  arithmetic; do not build a guard. W2-N1 owns the seam client, which is the only layer that
  sees a whole envelope, and rejection belongs there. A guard here would be enforcement in
  the wrong layer and would collide with W2-N1's.
- The seam client, the `outcome` discriminant, and route changes. W2-N1 and W2-N2 own those
  and consume `limits.json` from you.
- Widening any cap. Widening requires Catalyst to deploy first and hold both bounds for one
  release; that case is not in this change and is written down in `CONTRACTS.md` so the next
  person does not re-derive it.
- `file_attachments`' Notes9-side cap (C5). Notes9 declares no constant, so there is nothing
  to assert against. It is recorded as a **risk** in ARCHITECTURE.md rather than pretended to
  be enforced. Adding that constant is later slice work, not yours.
