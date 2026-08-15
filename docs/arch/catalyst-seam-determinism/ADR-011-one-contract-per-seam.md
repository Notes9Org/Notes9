# ADR-011: One contract package per seam, enforced by a hash-parity test in both repos

- Status: accepted
- Date: 2026-08-15
- Feature: [[projects/catalyst-seam-determinism]]
- Supersedes: none

## Context

Two repos share no type checker, and today they share almost no contract either. There is
no codegen, no OpenAPI validation, no shared package, and no cross-repo parity job.

Exactly one real joint exists: `spec-patch-proposal.contract-fixture.json` is byte-identical
in both repos (sha256 `f739b168…`) and is tested on both sides including key order. It is
the best-engineered thing in the system, and it has one weakness — **nothing compares the
two files.** Copy one, forget the other, and both suites stay green.

Everything not covered by that fixture has drifted. Four caps disagree by up to tenfold,
masked because `LIMITS_MODE` defaults to `shadow` on both sides so the effective ceiling is
Catalyst's Pydantic and the user sees a raw 422. Twenty SSE event types exist and five are
documented, and the undocumented set includes `text_reset`, which instructs the client to
discard its buffer — so a client built from the API documentation renders corrupted text.
Two mutually incompatible SSE vocabularies exist, so one parser cannot serve both streams.

`pnpm typecheck` and `pnpm lint` pass. That is the diagnosis, not the reassurance.

## Decision

A single `contracts/v1/` directory is the source of truth for every seam message, every SSE
event, and every limit. It is vendored verbatim into both repos and carries a
`CONTRACT_HASH` computed over the sorted concatenation of its files. Both repos run a test
that recomputes the hash from their own copy and fails on mismatch, and both repos run that
test in CI. Where two current values disagree, the **smaller wins**, because the smaller one
is what production already enforces.

## Consequences

A one-sided edit becomes a red build instead of a silent runtime divergence, which is the
specific failure this system has repeatedly shipped. It extends the mechanism already proven
here rather than introducing a new one.

It costs a vendoring step on every contract change, and it deliberately does not solve
generation: the schemas are hand-written JSON Schema, so a mistake in one is a mistake in
both. That is an accepted trade — a codegen pipeline for a handful of endpoints is more
machinery than the problem needs, and the ponytail rule is that a mechanism already working
in this repo beats a better one that is not here yet.

It forecloses per-repo local constants for anything on the seam. A local cap is now a bug.

## Alternatives rejected

**OpenAPI generation from the FastAPI app.** Catalyst can emit a spec, but it would make
the AI repo authoritative over Notes9-owned concepts — and the `mutations` passthrough is
deliberately typed `Dict[str, Any]` on the AI side precisely because Notes9 owns that zod
schema. Generation would invert an ownership decision that is currently correct.

**A shared npm/PyPI package.** Correct at a larger scale and too much release machinery for
two services in two repos owned by one team. Revisit if a third consumer appears.

**Keep the fixture pattern, add more fixtures.** This is the recommendation minus the hash,
and the hash is the entire point: without it, nothing compares the copies.
