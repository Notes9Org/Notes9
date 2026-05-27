# ADR-0006: Deterministic Preflight Entity Fetch Before LLM Loop

**Date**: 2026-05-27
**Status**: accepted
**Deciders**: Notes9 engineering

## Context

Users frequently paste workspace URLs (e.g. `/lab-notes/<uuid>`) into the chat. Without special handling, Claude would need to call `fetch_full_records` itself in the first turn. In practice this caused a failure mode: the LLM would sometimes skip the tool call, answer from general knowledge, and say "I don't see this document in your workspace" — even though the document existed.

## Decision

`agents/runtime/planner._run_preflight` runs *before* the LLM loop. Any entity IDs extracted by the Normalize stage are fetched from Supabase into the `EvidenceStore`. A hard prompt rule (`LINKED_RESOURCES_RULE`) is injected telling the LLM to treat those records as already in evidence and cite them directly.

## Alternatives Considered

### Alternative 1: Let the LLM call fetch_full_records itself
- **Pros**: No special-case code; the agent discovers what it needs organically
- **Cons**: LLM sometimes skips the call and answers from training knowledge; produces "I don't see this document" errors; wastes one turn fetching something deterministically known
- **Why not**: Was the original design. The "I don't see this document" error appeared repeatedly in user sessions. Preflight eliminated it.

### Alternative 2: Include full record content directly in the user message
- **Pros**: Guaranteed to be in context
- **Cons**: Blows up the user message for large documents; not cache-friendly; bypasses the EvidenceStore citation tracking
- **Why not**: Citation tracking and the `[N]` discipline depend on records entering via the EvidenceStore, not via the user turn

## Consequences

### Positive
- Eliminates the "I don't see this document" failure mode for URL-linked resources
- First LLM token is emitted faster — evidence is ready before streaming starts
- `LINKED_RESOURCES_RULE` gives the LLM a clear mandate: cite the loaded records, don't speculate

### Negative
- If the user pastes many URLs, preflight latency grows linearly with entity count
- Preflight fetches even if the LLM would have answered without needing those records (minor over-fetch)

### Risks
- If preflight fails (Supabase timeout), the run proceeds with empty evidence and the LLM may fall back to general knowledge. The preflight error is logged but not surfaced to the user as a hard failure.
