-- 079_agent_trace_capture.sql
-- Tier 0.2 "Observability — replay + prompt-version".
--
-- Adds two independent, OPT-IN debugging capabilities to the agent telemetry
-- tables. Both default to writing NOTHING, so applying this migration is a pure
-- additive no-op until the corresponding env flags are turned on.
--
--   1) PROMPT-VERSION STAMPING
--      agent_runs.prompt_version  — a stable 12-hex sha256 of the system-prompt
--      text + tool-policy used for the run (see telemetry.prompt_version_hash).
--      Lets us attribute regressions (cache-hit-rate / cost / verify-fail rise)
--      to a specific prompt build, and group runs by prompt build.
--
--   2) REPLAY / TRANSCRIPT CAPTURE (sampled, opt-in via NOTES9_TRACE_CAPTURE)
--      agent_llm_calls.request_messages   — raw Anthropic `messages` array for
--                                           the turn (jsonb), so a run can be
--                                           reconstructed/replayed.
--      agent_llm_calls.system_prompt_hash — hash of the exact system prompt sent
--                                           on that call (text), to correlate a
--                                           captured turn with a prompt build.
--      agent_tool_calls.tool_result_body  — raw tool result body (jsonb), the
--                                           other half of "why did the run do X".
--
-- COST / PII NOTE: replay capture stores raw model I/O, which is expensive and
-- may contain sensitive content. It is therefore:
--   * OFF by default     (NOTES9_TRACE_CAPTURE unset/false → columns stay NULL),
--   * SAMPLED            (NOTES9_TRACE_SAMPLE, default 0.0),
--   * SIZE-CAPPED        (oversized payloads are dropped, never truncated mid-JSON),
--   * intended to be TTL-pruned by an out-of-band retention job (see roadmap).
-- The application code writes these columns fire-and-forget and never raises if
-- the columns are absent, so this migration and the code can ship in either order.
--
-- All statements are idempotent (IF NOT EXISTS) and safe to re-run.
-- DO NOT bundle any data backfill here; these are nullable and start empty.

-- 1) Prompt-version stamping on the run -------------------------------------
alter table public.agent_runs
  add column if not exists prompt_version text;

comment on column public.agent_runs.prompt_version is
  'Stable 12-hex sha256 of system-prompt text + tool-policy for this run '
  '(telemetry.prompt_version_hash). Null when stamping was not supplied.';

-- 2) Replay / transcript capture --------------------------------------------
alter table public.agent_llm_calls
  add column if not exists request_messages jsonb;

alter table public.agent_llm_calls
  add column if not exists system_prompt_hash text;

comment on column public.agent_llm_calls.request_messages is
  'OPT-IN sampled raw Anthropic messages array for this turn (replay). '
  'Written only when NOTES9_TRACE_CAPTURE is on and the sample is selected.';

comment on column public.agent_llm_calls.system_prompt_hash is
  'Hash of the exact system prompt sent on this call; correlates a captured '
  'turn with a prompt build. Null unless replay capture wrote this row.';

alter table public.agent_tool_calls
  add column if not exists tool_result_body jsonb;

comment on column public.agent_tool_calls.tool_result_body is
  'OPT-IN sampled raw tool result body (replay). Written only when '
  'NOTES9_TRACE_CAPTURE is on and the sample is selected; size-capped.';
