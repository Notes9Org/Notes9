# ADR-013: Version the contract and validate passthrough, instead of allowlisting fields

- Status: accepted
- Date: 2026-08-15
- Feature: [[projects/catalyst-seam-determinism]]
- Supersedes: none

## Context

Notes9's stream proxy allowlists field names at `app/api/agent/stream/route.ts:61-92`.
Anything not explicitly enumerated is dropped with no warning, so the agent runs with
degraded context and answers plausibly. This has already happened four times — the comments
at `:75-91` naming `file_attachments`, `attachments`, `literature_sources` and `focus` are
scar tissue from four separate incidents of the same failure.

Deploy order is currently managed by convention. The prior architecture document states
"`AI` ships first" in prose, with nothing enforcing it. Nothing in either repo detects that
the other side is running a different contract, so a one-sided deploy degrades silently
rather than failing.

## Decision

Every seam request and response carries `contract_version`, a major version only. A server
receiving an unknown major returns `409 contract-mismatch` with the range it supports; a
client seeing a mismatch surfaces it rather than degrading. Within a major, changes are
additive-only and unknown fields are **preserved, never dropped** — the proxy validates
against the shared schema and passes through, instead of enumerating names. Absent
`contract_version` is treated as `"1"` for one full major, which is what allows the two
repos to deploy in either order.

## Consequences

Adding a context field stops being a two-repo coordination problem: the new field flows
through an old proxy untouched, so the failure that has occurred four times cannot recur.
A genuine incompatibility becomes a loud, typed, countable error instead of a quiet
degradation, and the count of `contract-mismatch` responses is the 3am signal named in the
architecture's rollout section.

It costs a schema validation step on a hot path, and it requires discipline about what
"additive" means — a field whose *meaning* changes while its name stays is still a breaking
change and the version does not catch it.

## Alternatives rejected

**Keep the allowlist and remember to update it.** Four incidents is enough evidence.

**Lockstep deploys.** Removes the skew window by removing independent deployability, which
is worse for two services on different release cadences, and does not help the case where a
deploy is rolled back on one side only.

**Semantic versioning with minors.** Minors would encode information nothing reads. Major
alone is the smallest thing that answers the only question asked at runtime: can I talk to
you?
