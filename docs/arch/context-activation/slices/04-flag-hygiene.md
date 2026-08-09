# Slice 04: flag-hygiene

Repo: **AI** (`/Users/ramanareddy/Desktop/ELN/AI`). Branch target: `dev`. Wave 2, parallel
with 02 and 03.

## Goal

When this is done, `MEMORY_BM25_ENABLED` means one thing everywhere and can be changed
without restarting the process, and the rollout document no longer contradicts the code it
describes. Small slice, but it removes two traps that would otherwise fire during Phase C
when flags actually start moving.

## Owns (you may write ONLY these)

- `catalyst/core/memory/store.py`
- `catalyst/core/memory/context_builder.py`
- `catalyst/tests/test_flag_parsing.py`  (new file)
- `catalyst/docs/ROLLOUT_2026-08-04_context_flags.md`

Touching anything outside this list is a bug. Slice 02 is editing `catalyst/main.py` and
adding `catalyst/api/health_context.py`; slice 03 is editing `worker/`. Do not touch either.

## Context

**Defect 1: one flag, two parsings.** `MEMORY_BM25_ENABLED` is read strictly at
`catalyst/core/memory/store.py:52` (`os.environ.get(...) == "true"`) and loosely at
`catalyst/core/memory/context_builder.py:414` and `:479`
(`in ("1","true","yes","on")`). Setting `MEMORY_BM25_ENABLED=1` therefore enables the BM25
path in `context_builder` while leaving it disabled in `store`. That is a live half-on
state where two halves of one subsystem disagree about whether they are running, and it
produces behaviour that matches neither the on nor the off configuration.

`MEMORY_ENTITY_ENABLED` has the same strict-parse shape at `store.py:53` and
`core/memory/curator.py:807`. Those two agree with each other, so they are consistent
today, but they sit in the same lines you are editing.

**Defect 2: import-time reads.** `store.py:52-53` evaluate at module scope, unlike every
other flag in the context stack, which reads per call. A change to the environment after
import does not take effect, and `monkeypatch.setenv` in a test silently does nothing.
That second part matters more than it looks: it means any test asserting on these flags
today is passing for the wrong reason.

**Defect 3: the rollout doc contradicts the code.**
`catalyst/docs/ROLLOUT_2026-08-04_context_flags.md` states the literature and notes_copilot
router recipes ship "with no flag on this". Both are gated behind `NOTES9_CONTEXT_ROUTER`,
default off, at `catalyst/api/chat.py:412` and `catalyst/api/literature_biomni.py:360`. The
doc also omits `NOTES9_CONTEXT_ROUTER` from its flag table and activation sequence
entirely, so following it as written would leave the recipes off while believing them live.

The repo-wide convention is the loose form. Of the flags in the context stack,
`NOTES9_FOCUS_ENVELOPE`, `NOTES9_CONTEXT_ROUTER`, `NOTES9_RAG_RERANK`,
`WORKER_CONTEXTUAL_RETRIEVAL`, `NOTES9_LIT_MEMORY`, `NOTES9_UNIFIED_RETRIEVE`,
`MEMORY_CONSOLIDATION_SWEEPER`, and `NOTES9_ORG_COLLABORATION` all use
`in ("1","true","yes","on")`. Extend that convention rather than choosing your own, even if
you would have picked differently. Consistency beats preference here.

`NOTES9_RETRIEVER` is deliberately excluded: it is a string-valued mode flag
(`== "unified"`), not a boolean, and its five read sites are all identical. Leave it alone.

## What to build

1. Convert `store.py:52-53` from import-time module-scope reads to per-call functions,
   matching the shape used elsewhere in the codebase, for example
   `contextual_enabled()` at `worker/services/contextual.py:27-28`.
2. Make `MEMORY_BM25_ENABLED` use the loose convention in **both** `store.py` and
   `context_builder.py:414,479`, resolved through a single shared predicate so a third
   parsing cannot appear later. Same for `MEMORY_ENTITY_ENABLED` in `store.py`.
3. Correct `ROLLOUT_2026-08-04_context_flags.md`: remove the "no flag on this" claim, add
   `NOTES9_CONTEXT_ROUTER` (default off) to the flag table, and add flipping it to the
   activation sequence. Also add a line noting that ADR-005 in
   `Notes9/docs/arch/context-activation/` supersedes this document's activation order, and
   why: corpus repair precedes retrieval activation.

## Interfaces you must honor

Truthiness convention for boolean flags in this codebase, which your shared predicate
implements:

```python
os.getenv(NAME, default).strip().lower() in ("1", "true", "yes", "on")
```

Read per call, never at import. Defaults are unchanged by this slice: `MEMORY_BM25_ENABLED`
off, `MEMORY_ENTITY_ENABLED` off. **This slice changes parsing and timing only, never a
default.** If a flag's effective value changes for any existing environment other than the
half-on `=1` case, that is a bug in your change.

## Depends on

No slice. But there is a **blocking repo precondition**: `catalyst/docs/ROLLOUT_2026-08-04_context_flags.md`
does not exist on `dev`. It was added by commit `5d9ba76` and lives only on `origin/main`,
which `dev` is 9 commits behind. `origin/main` must be merged into `dev` before this slice
starts, or the file you are told to correct will not be there and you will be tempted to
create a new one, producing a second copy of a document that already exists.

If the file is still missing when you start, stop and report it. Do not create it.

## Done when

- [ ] `MEMORY_BM25_ENABLED=1` produces the same boolean in `store` and `context_builder`.
      A test asserts this directly; it fails on today's code.
- [ ] `monkeypatch.setenv("MEMORY_BM25_ENABLED", "true")` after import changes the
      resolved value. A test asserts this; it fails on today's code.
- [ ] `""`, unset, `"false"`, `"0"`, `"no"`, `"off"` all resolve false; `"1"`, `"true"`,
      `"TRUE"`, `" yes "`, `"on"` all resolve true, in both modules.
- [ ] `ROLLOUT_2026-08-04_context_flags.md` contains no claim that any router recipe ships
      unflagged, lists `NOTES9_CONTEXT_ROUTER` with default off, and points at ADR-005.
- [ ] Existing memory tests still pass. If any passed only because the import-time read
      made `monkeypatch` a no-op, fix the test and say so in the PR body; that test was
      asserting nothing.

## Edge cases to test

This slice owns no row of the Failure modes table in `../ARCHITECTURE.md`. It is a
correctness fix to flag resolution, not a runtime path with volume, size, or partial-failure
behaviour of its own. Its edge cases are the parsing boundaries enumerated under **Done
when**: empty string, unset, mixed case, surrounding whitespace, and every documented
false-y and truth-y spelling, asserted in both modules.

The one boundary worth calling out explicitly: a flag value the convention does not
recognise, such as `MEMORY_BM25_ENABLED=maybe`, must resolve **false** rather than raising.
Fail closed. A malformed flag turning a subsystem on is strictly worse than one leaving it
off.

## Out of scope

- Changing any flag's default. Not one. Defaults move in Phase C, by an operator, one at a
  time, verified through `/health/context`.
- `NOTES9_RETRIEVER`. String-valued mode flag, five consistent read sites, deliberately
  untouched.
- Reporting these flags in `/health/context`. Slice 02 deliberately excludes memory flags
  because you are repairing them concurrently. It becomes a follow-up once this merges.
- Deleting `MEMORY_CONSOLIDATION_SWEEPER`, the only default-on flag in the stack. Worth a
  look someday, unrelated today.
