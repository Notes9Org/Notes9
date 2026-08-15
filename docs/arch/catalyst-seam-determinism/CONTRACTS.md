# Notes9 ↔ Catalyst: the cross-repo contract

Feature: [[projects/catalyst-seam-determinism]]
Forced by: [[analysis/adr-011-one-contract-per-seam-enforced-by-a-parity-fixture]] ·
[[analysis/adr-013-contract-versioning-and-schema-validated-passthrough]] ·
[[analysis/adr-004-enforce-catalyst-request-bounds]]

Date: 2026-08-15. Repos: `Notes9` (Next.js) and `AI` (FastAPI Catalyst), both on `dev`.

The type checker stops at the repo boundary. This document plus the two conformance tests
below are what replace it.

## The fixture

`contracts/notes9-catalyst.v1.json`, byte-identical in both repos.
Verified `sha256[0:16] = c304a8a0740658e0` on both copies at time of writing.

**Resolution rule for a disagreement: the smaller value wins.** Not arbitrary. Notes9
defaults `LIMITS_MODE` to `shadow`, so its guards log and do not block; Catalyst's pydantic
is therefore the effective ceiling already in production, and the user experiences a
divergence as a raw `422` rather than as our own message. The smaller number is not a new
policy, it is a written-down description of what already happens.

## Rows

| # | Fact (verbatim) | Producer | Consumer | Conformance test | State |
|---|---|---|---|---|---|
| C1 | `query` is at most **10000** characters | AI `catalyst/core/contracts/request.py:250` | Notes9 `lib/limits/config.ts:26` (`QUERY_CHARS_MAX`, currently `100_000`) | AI `TestRequestLimits::test_query_chars_max` · N9 `"query character cap matches the contract"` | **RED on Notes9** |
| C2 | `history` is at most **100** items | AI `request.py:259` | Notes9 `lib/limits/config.ts:23` (`HISTORY_ITEMS_MAX`, currently `400`) | AI `test_history_items_max` · N9 `"history item cap matches the contract"` | **RED on Notes9** |
| C3 | `ChatMessage.content` is at most **100000** characters | AI `request.py:179` | Notes9 `lib/limits/config.ts:29` (`MESSAGE_CONTENT_CHARS_MAX`, currently `200_000`) | AI `test_message_content_chars_max` · N9 `"message content character cap matches the contract"` | **RED on Notes9** |
| C4 | `attachments` is at most **10** items | AI `request.py:307` | Notes9 `lib/limits/config.ts:32` (`ATTACHMENTS_ITEMS_MAX`, currently `50`) | AI `test_attachments_items_max` · N9 `"attachment item cap matches the contract"` | **RED on Notes9** |
| C5 | `file_attachments` is at most **5** items | AI `request.py:130` (`MAX_FILE_ATTACHMENTS_PER_REQUEST`) | Notes9 has no counterpart constant | AI `test_file_attachments_items_max` | green; N9 side is a gap, see below |
| C6 | `literature_sources` is at most **12** items | AI `request.py:62` (`MAX_LITERATURE_SOURCES_PER_REQUEST`) | Notes9 `lib/notes9-agent-request.ts` `LITERATURE_SOURCE_CAPS` | AI `test_literature_sources_items_max` | green |
| C7 | spec-author `prompt` is at most **4000** characters | AI `catalyst/api/analysis_spec.py:74` | Notes9 `lib/data-analysis/ai/spec-author.ts:44` (`SPEC_AUTHOR_PROMPT_MAX_CHARS`) | AI `test_prompt_chars_max` · N9 `"prompt character bound matches the contract"` | **green both sides** |
| C8 | spec-author `system` is at most **8000** characters | AI `analysis_spec.py:78` | Notes9 `lib/data-analysis/ai/spec-author.ts:46` (`SPEC_AUTHOR_SYSTEM_MAX_CHARS`) | AI `test_system_chars_max` · N9 `"system character bound matches the contract"` | **green both sides** |
| C9 | a spec-author reply carries at most **40** mutations | AI `analysis_spec.py:32` (`MAX_MUTATIONS`) | Notes9 `lib/data-analysis/ai/spec-author.ts:56-65` (zod `.max(40)`) | AI `test_mutations_max` | green |
| C10 | the SSE vocabulary is exactly these **20** names: `artifact, citations_manifest, citations_update, clarify, done, error, graph, notice, permission_request, ping, run_started, synthesis_plan, synthesis_step, text_reset, thinking, thinking_token, token, tool_call, tool_result, tool_start` | AI `catalyst/core/sse_schema.py:258-279` | Notes9 stream clients (`app/api/agent/stream/route.ts`, `components/layout/right-sidebar.tsx`) | AI `test_registry_matches_contract_exactly` · N9 `"names all 20 SSE events"` | green |
| C11 | `text_reset` instructs the client to discard its accumulated token buffer | AI `sse_schema.py` | any Notes9 stream client | AI `test_text_reset_is_present` | green |

C7, C8 and C9 are ADR-004's work. They are the only rows that were already conformant on
both sides, and they are in this table deliberately: they are the evidence that this
mechanism works, and they are the shape the four red rows are being brought into.

### Rows that are not contracts

Recorded here so they are not mistaken for gaps in the table.

- **The mutation-kind set** is already governed by
  `contracts/spec-patch-proposal.contract-fixture.json`, byte-identical in both repos
  (`sha256 f739b168…`) and asserted on both sides including key order. It predates this
  document, it works, and it is the pattern this contract generalises. Left where it is.
- **C5's Notes9 side.** Notes9 declares no `file_attachments` cap at all, so there is
  nothing to assert against and no test can be written. Per the rule that a row without a
  test on both sides is a hope rather than a contract, this is recorded as a **risk** in
  ARCHITECTURE.md rather than pretended to be enforced. Adding the constant is slice work.
- **Row authorisation.** Three implementations exist and two disagree. It is not expressible
  as a fixture value, so it is not a row here; it is ADR-012's conformance matrix instead.

## Falsification

The gate requires that a conformance test be *observed* to fail, because a test that
asserts nothing passes forever.

Run on 2026-08-15 with `AI/.venv/bin/python -m pytest`:

```
run 1, as committed                              11 passed
fixture broken: query_chars_max 10000 -> 999999
                text_reset removed from sse_events
run 2, broken fixture                             3 failed, 8 passed
  FAILED TestRequestLimits::test_query_chars_max
  FAILED TestSseVocabulary::test_registry_matches_contract_exactly
  FAILED TestSseVocabulary::test_text_reset_is_present
fixture restored                                 11 passed
```

The Notes9 side needed no artificial falsification: it is **red on arrival**, which is the
tripwire catching a real divergence that has been live in production.

```
npx vitest run lib/__tests__/contract-notes9-catalyst.test.ts
  Tests  4 failed | 4 passed (8)
  expected 100000 to be 10000     (C1)
  expected 400    to be 100       (C2)
  expected 200000 to be 100000    (C3)
  expected 50     to be 10        (C4)
```

Those four failures are the acceptance criteria for the first slice. Do not make them green
by editing the fixture upward; that reintroduces the 422.

## Order

- **Build dependency: none.** Both sides can be built and reviewed in parallel. The fixture
  is already committed to both repos, so neither waits on the other to compile.
- **Deploy order: Notes9 FIRST, then Catalyst.** Notes9 is narrowing its own caps to values
  Catalyst already enforces, so a Notes9 deploy alone is strictly safe: it starts rejecting,
  with its own message, requests that Catalyst was already 422-ing. Catalyst needs no change
  for C1 to C4 at all.
- **This is the general rule applied, not an exception to it.** Widen the consumer first,
  narrow the producer last. Here the producer (Catalyst) is not moving, and the consumer is
  narrowing to match, so there is no window in which valid traffic is rejected.
- **Backward window: none required** for C1 to C4. A user who was sending a 50,000-character
  query was already getting a 422; after the change they get a Notes9-authored message
  instead. That is a strict improvement with no compatibility window to hold open.
- **Where a window IS required:** any future *widening* of these values. Catalyst must widen
  and deploy first, and hold both the old and new bound for one release, before Notes9 sends
  anything larger. That case is not in this change and is written down so the next person
  does not have to re-derive it.

## Gate

- [x] Every row has verbatim values, not a description of them
- [x] Every row names a producer `file:line` and a consumer `file:line`
- [x] Every row has a conformance test on both sides, **except C5**, which is recorded above
      as a risk rather than counted as a contract, because Notes9 has no constant to assert
- [x] Both conformance tests have been run, and the AI side has been observed to fail
      against a deliberately edited fixture and pass again after restore
- [x] Deploy order and the backward-compatibility window are stated
- [ ] `slices.json` records `"contracts": "docs/arch/catalyst-seam-determinism/CONTRACTS.md"`
      — written by `/slice`, which runs next
