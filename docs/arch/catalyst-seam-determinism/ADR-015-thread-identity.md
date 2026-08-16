# ADR-015: A thread is the surface's own key, and history rides the bundle

- Status: accepted
- Date: 2026-08-15
- Feature: [[projects/catalyst-seam-determinism]]
- Supersedes: none

## Context

The Data Analysis AI request body is `{prompt, spec, table}` and nothing else. No thread id,
no history, no prior rationale. The sharpest consequence is that when the model returns
`clarificationNeeded` the Execute button is withheld, and the user's only affordance is a
fresh prompt carrying neither the question nor their previous message — **the assistant asks
a question the architecture prevents the user from answering.**

The slots already exist. `buildContextBundle` accepts `recentEdits` and `result`
(`lib/data-analysis/ai/spec-author.ts:294,297`), and the route leaves both empty citing "no
producer" in a comment that is now out of date: the edit-history producer is
`lib/data-analysis/workspace/edit-history.ts` held in state at
`data-analysis-workspace.tsx:1498`, and the live engine-result producer is
`data-analysis-workspace.tsx:895`. (Note the trap: `hooks/use-analysis-spec.ts:60` looks
like the result producer and is orphaned with zero importers, which is also why no engine
warm-up ever runs.)

The pattern also already exists one directory over: `app/api/agent/run/route.ts:34-36`
forwards `session_id` and a bounded `history`, with `checkHistory` from
`lib/limits/guards.ts` bounding it.

## Decision

A thread is identified by the surface's own natural key — the analysis tab id, the chat
session id. No new identifier is minted and nothing new is persisted. `thread: {id, turn}`
rides the envelope, and prior turns ride `payload.context.turns`, bounded by the shared
`limits.json` and by the existing `checkHistory`. `thread.id` plus `turn` is the idempotency
key, so a duplicate turn returns the stored result rather than recomputing.

History goes in the **bundle, never the prompt string.**

## Consequences

Follow-up works, and the clarifying-question dead end closes as a consequence rather than
as a feature: the question and the answer land in the same context. Because `turn` is an
idempotency key, a retried request stops being a second model call.

Putting history in the bundle rather than the prompt is not a style preference. The prompt
is bounded at 4,000 characters by ADR-004, and the repair round already consumes that budget
with rejected mutations; concatenating turns into the prompt would starve the repair round
in exactly the case it exists for. The bundle has its own 20,000-character truncation, which
is a blind character slice, so turns must be bounded client-side before they reach it.

Minting no identifier means a thread cannot outlive its surface. Persisting a conversation
is a separate decision for the day something needs to read it back, and today nothing does.

## Alternatives rejected

**A new `session_id` on the wire, persisted to `chat_sessions` with a new kind.** The
literature-search precedent, and premature: there is no reader. Adopt it when one exists.

**Compose the follow-up client-side into one self-contained prompt.** Cheap, and it burns
the 4,000-character budget faster while losing the distinction between what the user said
and what the assistant asked.

**Send the whole edit history unbounded.** The bundle truncates with a blind character
slice at 20,000, so an unbounded list silently eats the fields after it in the sorted JSON
dump. Bounding client-side is what keeps truncation from being invisible.
