# Slice W2-N1: n9-seam-client

## Goal

Every Notes9 call to Catalyst goes through one client that speaks the envelope, so no route
hand-rolls `fetch` and no route invents its own error shape. When this is done the client
supports both JSON and SSE, rejects an over-size request *before* the network call using the
shared `limits.json`, and refuses a second in-flight turn on the same thread rather than
interleaving it.

## Owns (you may write ONLY these)

- `lib/seam/client.ts`
- `lib/seam/sse.ts`
- `lib/seam/errors.ts`
- `lib/seam/index.ts`
- `lib/__tests__/seam-client.test.ts`

You do **not** own `lib/seam/contracts/**` — W1-N2 authored that and you consume it. You do
**not** own any route under `app/api/**`; W2-N2 migrates those onto you and is a separate
slice. Touching either is a bug — stop and report instead.

## Context

Today each route hand-rolls its own `fetch` to Catalyst, which is why the seam has four
different error shapes and why four cap divergences survived unnoticed. This slice creates
the single chokepoint.

Two behaviours belong here and nowhere else, because a client is the only layer that sees
every call:

- **Pre-flight size rejection.** A request over the caps in `limits.json` is refused here,
  with our own typed `bad-request`, before the network call. One byte past the bound takes
  the same path. The user must never see a raw upstream 422 again — that is the entire
  user-visible point of the feature.
- **Per-thread turn serialisation.** A second in-flight turn for the same `thread.id` is
  rejected `409 contract-mismatch` rather than interleaved.

Note the compound bound: `query` caps at 10,000 characters while `history[].content` allows
100,000 across 32 entries — a ~3.2 MB effective body through the history field. Check
`total_request_bytes` against the whole envelope, not just the individual fields.

## Interfaces you must honor

### Consume: the contracts package (from W1-N2)

`lib/seam/contracts/v1/` — `limits.json` for every cap, `request.schema.json` and
`response.schema.json` for the envelope. Never retype a cap. A local literal passes every
behavioural test and silently drifts the moment the contract moves.

### Produce: the request envelope (I2)

```jsonc
{
  "contract_version": "1",          // REQUIRED. major only.
  "seam": "agent" | "analysis-spec" | "literature" | "artifact",
  "thread": { "id": string, "turn": integer },
  "payload": { ... }                // seam-specific
}
```

### Produce: the response envelope (I2)

```jsonc
{ "contract_version": "1",
  "outcome": "ok" | "refused" | "clarify" | "bad-request"
           | "unauthorized" | "unavailable" | "contract-mismatch",
  "payload": { ... },               // present iff outcome === "ok"
  "reason": string,                 // present iff outcome !== "ok"
  "facts": Fact[] }                 // MAY be empty, MUST be present
```

HTTP status mirrors `outcome` exactly: `ok`→200, `clarify`→200, `refused`→200,
`bad-request`→400, `unauthorized`→401, `contract-mismatch`→409, `unavailable`→503.

`refused` and `clarify` are **200 on purpose** — they are answers, not failures. That part of
today's behaviour is correct and is preserved deliberately. Do not "fix" it into a 4xx.

### Produce: SSE handling (I3)

One parser for the whole 20-name vocabulary. Unknown event names MUST be ignored and the
stream MUST continue. `text_reset` instructs the client to discard its accumulated token
buffer — a client that does not handle it renders corrupted text.

## Depends on

- **W1-N2** — `lib/seam/contracts/v1/` with `limits.json` and the two envelope schemas.

## Done when

- [ ] One client handles JSON and SSE; nothing else in `lib/seam/` opens a socket
- [ ] Over-size requests are refused pre-flight with typed `bad-request`, never a raw 422
- [ ] A second in-flight turn on one `thread.id` yields `409 contract-mismatch`
- [ ] `outcome` is read from the response, never manufactured client-side
- [ ] Caps are read from `limits.json`; `grep` finds no retyped literal
- [ ] `pnpm typecheck` clean
- [ ] Tests pass with runner output pasted. "Should pass" fails the gate.
- [ ] Docs updated

## Edge cases to test

1. **Failure mode — 10× turns/sec on one thread.** Guaranteed behaviour: the second
   concurrent turn for the same `thread.id` is rejected `409 contract-mismatch`, never
   interleaved. Assert the first still completes normally.
2. **Failure mode — largest realistic payload.** Rejected at the client before the network
   call, typed `bad-request`. Assert no request was issued: a rejection that still hits the
   network has not implemented the requirement.
3. **One byte past.** Exactly at the cap succeeds; one over takes the identical path as the
   grossly-oversized case. Off-by-one here rejects valid work.
4. **The compound bound binds.** Under every individual cap but over `total_request_bytes`
   is rejected. Build it from `history` entries — that is the ~3.2 MB path.
5. **Failure mode — unknown SSE event.** Ignored, stream continues, subsequent events still
   parse. Assert the events *after* the unknown one arrive.
6. **`text_reset` discards the buffer.** Tokens accumulated before it are dropped and the
   rendered text starts fresh. Without this the user sees duplicated output.
7. **Every outcome maps to its status, both directions.** All seven. Especially: `refused`
   and `clarify` arrive as 200 and are surfaced as answers, not thrown as errors.
8. **`facts` is always present.** An `ok` response with `facts: []` is valid and must not be
   treated as missing. An absent `facts` key is a contract violation.
9. **Failure mode — version skew.** A major-version mismatch yields `409 contract-mismatch`
   carrying the supported range, detected client-side from the response envelope, never a
   silent degrade.

## Out of scope

- Migrating routes onto the client. W2-N2 owns that and depends on you.
- The fact ledger and token substitution. W4-N1 owns those; you only pass `facts` through.
- Retiring the literature SSE protocol on the server. W2-A3 in the AI repo owns that — you
  parse the unified vocabulary as `sse.events.schema.json` defines it.
- Cancellation. It is cooperative everywhere today, so an in-flight LLM call always runs to
  completion and every SLO must budget one full model call past the deadline. Documented as
  a named out-of-scope item, not fixed here.
