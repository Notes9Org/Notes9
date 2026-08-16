# ADR-014: Determinism is the default; sampling is opt-in and declared

- Status: accepted
- Date: 2026-08-15
- Feature: [[projects/catalyst-seam-determinism]]
- Supersedes: none

## Context

Determinism is currently opt-in per call site, and the default is inverted.
`catalyst/llm/gateway.py:493` declares `run_text(..., temperature: float = 0.3)` as its
signature default, so a call site that omits the kwarg silently samples. The same inversion
appears at `bedrock_converse.py:36,82` and at `llm_client.py` / `anthropic_client.py` with
`0.7` defaults.

Most critical call sites do pass `0.0` explicitly and are correct today —
`analysis_spec.py:210-217` and `verification.py:167` among them. Nothing structural keeps
them that way. `BIOMNI_TEMPERATURE` is worse: `catalyst/biomni_svc/config.py:80` reads it
with `require_float` and **no code default at all**, so the sampling temperature of the
Biomni literature agent is invisible from the source and is whatever ops set.

Three further sources of run-to-run variance leak to users. The citation verdict cache is
process-local (`verification.py:110-128`), so two instances behind a load balancer can
legitimately disagree about whether a span supports a claim. The embedding-grounding budget
is 2.5 s, and `grounding.py:65-74` records that the previous 0.3 s value zeroed embedding
grounding out entirely on cold containers — so a cold instance still silently loses spans a
warm one keeps. And `rapidfuzz` is an *optional* dependency: `grounding.py:42-49` switches
between Levenshtein and `difflib` similarity, two different metrics, compared against the
same `0.55` threshold. Grounding therefore differs by environment.

Enabling extended thinking forces temperature to 1 and silently overrides
`CORE_TEMPERATURE=0.0` (`core_provider.py:493-497`). It is dormant because the budget
defaults to 0, and it is a live trap.

## Decision

Invert the default. `run_text` and every transport default to `temperature=0.0`. A call
site that wants sampling passes it explicitly and names why in a comment. `BIOMNI_TEMPERATURE`
gets a code default of `0.0`. `rapidfuzz` becomes a hard dependency so the grounding metric
is the same everywhere. The verdict cache is keyed on the fact token from ADR-010 and is
either shared or disabled, never process-local. Enabling extended thinking with a non-zero
budget requires an explicit acknowledgement that it overrides `CORE_TEMPERATURE`.

## Consequences

A forgotten kwarg now fails safe instead of silently sampling, which is the single highest
ratio of risk removed to code changed in this whole architecture. Identical inputs become
genuinely cacheable, which is what makes the fact ledger's cache key meaningful.

It will change output on any path that was relying on 0.3 without knowing it, and some of
those paths are prose surfaces where a little variation was arguably fine. That is accepted:
prose that varies run to run is prose a scientist cannot cite, and the surfaces that
genuinely want variety can opt in.

Pinning `rapidfuzz` adds a compiled dependency to the deploy image.

## Alternatives rejected

**Audit every call site and leave the default.** Fixes today's call sites and not tomorrow's.
The next call site written is the next bug.

**Set temperature centrally via config.** Moves the value out of the source, which is
precisely what makes `BIOMNI_TEMPERATURE` the worst offender in the current code.

**Leave prose surfaces sampling.** Tempting, and it reintroduces the two-architectures split
that this whole design exists to remove.
