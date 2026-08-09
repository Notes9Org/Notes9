# ADR-009: Gate activation on production-corpus recall, not fixtures

- Status: accepted
- Date: 2026-08-08
- Supersedes: the eval gate described in `AI/catalyst/docs/ROLLOUT_2026-08-04_context_flags.md`

## Context

The rollout plan gates flipping `NOTES9_RETRIEVER` to `unified` on a `recall@context`
result from `AI/catalyst/eval/retrieval_eval.py`. The harness is sound: it computes
`|expected ∩ returned source_ids| / |expected|`, runs the legacy blend and the split-leg
path side by side, and scores a retrieval error as 0.0 rather than dropping it.

The gold set is not. `eval/gold/retrieval_recall.json` holds four queries against a
six-chunk fixture corpus. Production holds 4866 chunks across 370 chunked sources and six
source types.

Four queries cannot distinguish a real improvement from noise. One query changing verdict
moves the score by 25 points. There is no confidence interval worth computing, and any
threshold set on it is arbitrary.

More seriously, a fixture corpus cannot exhibit the failure modes the unified path exists
to handle. RRF fusion at k=60 is a decision about reconciling dense and lexical rankings
that disagree; six chunks rarely disagree. Cohere rerank operates on the top 50 fused
results and never engages below that. Vocabulary mismatch, near-duplicate chunks,
multi-source answers, and cross-source-type retrieval are all absent by construction.

The corpus state makes this worse in a way that is specific rather than general. Coverage
gaps are not random: `literature_review` is missing 67.9% of its sources while
`experiment_summary` is missing 11.1%. A gold set built against today's corpus is biased
toward whichever source types happen to be healthy, and would report a confident number
about a corpus that does not represent the product.

The existing `eval/gold/` directory already carries a richer convention for the literature
evals (`Q1.json`, `Q6.json`, `Q12.json`, `Q13.json`, `Q15.json`), where gold files hold
real expected identifiers and the harness switches from a proxy heuristic to deterministic
recall when gold is present. The pattern to extend exists; workspace retrieval is the one
place it was not applied.

## Decision

Activation is gated on `recall@context` measured over a gold set drawn from the **repaired
production corpus**, built after Phase B reports every source type under a 2% coverage gap.

The gold set targets 30 to 50 queries, stratified across all six source types in rough
proportion to their post-repair share, with expected `source_id`s recorded from real
documents. It extends the existing `eval/gold/` convention and adds no harness code;
`retrieval_eval.py` already compares both paths.

The gate is: **unified `recall@context` is at least legacy, with no source type regressing
by more than 5 points.** The per-type floor exists because an aggregate mean can hide one
source type collapsing while others improve, and a category of documents becoming
unfindable is a worse outcome than a flat average is a good one.

Sequencing constraints, each for a stated reason:

- Built after Phase B, so absences are not baked into the gold set.
- Built after ADR-008 drops the ivfflat index, so the measurement is not partly a record of
  planner choice.
- Queries are authored against documents, not by inspecting retriever output, so the gold
  set does not encode the behaviour of whichever path was used to build it.

A failed gate does not silently defer the rollout. It produces a written finding naming
which source type regressed and why, because "the eval was inconclusive so we did nothing"
is how six work packages reached this state.

## Consequences

Buys: a verdict that means something. Thirty to fifty stratified queries over a real corpus
can separate a genuine improvement from noise, and the per-type floor catches the specific
failure an aggregate hides. The eval becomes reusable as a regression check for every later
retrieval change, which is worth more than this one decision.

Costs: authoring 30 to 50 gold queries with verified expected sources is genuine manual
work, plausibly a day, and it cannot start until Phase B lands. It is the single largest
piece of human effort in this plan. It is accepted because the alternative is flipping
production retrieval on four fixture queries.

Gold sets built from production also age. Documents get edited and deleted, and expected
`source_id`s go stale. The set needs a periodic re-verification pass, and a query whose
expected source no longer exists must fail loudly rather than score 0.0 and look like a
retrieval regression.

Forecloses: nothing. The harness is unchanged and the fixture gold set stays for fast
offline tests.

## Alternatives rejected

**Keep the four-query fixture gate.** Lost because it cannot support the decision it is
attached to. A 25-point-per-query resolution over a corpus that cannot exhibit fusion or
rerank behaviour is not a measurement of the thing being changed.

**Skip the offline eval and rely on shadow mode in production.** Shadow running both legs
and logging divergence is genuinely valuable and is not excluded here. It is rejected as
the *gate* because divergence is not correctness: it tells you the paths disagree, not
which one is right. Deciding that still requires labelled expected results, which is the
gold set. Shadow mode is the right follow-on once the gate passes.

**Generate the gold set with an LLM over the corpus.** Tempting given the manual cost, and
rejected because it grades the retriever against a model's guess about what should be
retrieved. Errors correlate with the retriever's own failure modes, particularly on
vocabulary mismatch, which is exactly the case the eval exists to test. An LLM is fine for
*drafting* candidate queries for human verification; it cannot own the expected answers.

**Lower the bar to "unified is within 5 points of legacy" and flip for the architectural
benefits.** Lost because it inverts the burden of proof. The unified path's advantages,
rank-based fusion that survives an embedding model change and a working `ef_search` knob,
are real but are arguments for building it, not evidence it retrieves better. Parity must
be demonstrated, not assumed.
