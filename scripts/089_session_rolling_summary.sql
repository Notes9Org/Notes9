-- 089_session_rolling_summary.sql
--
-- Adds a rolling summary column to chat_sessions so the live agent path can
-- maintain a compact representation of all turns that have aged out of the
-- recent verbatim window.  Nothing else changes: no RLS, no default rewrites,
-- no back-fill.
--
-- The agent writes to this column in a background thread (mirrors the
-- consolidate_due_at sweeper pattern) via the service_role client used
-- everywhere else in the memory stack.  The column is nullable so sessions
-- without a rolling summary simply inherit today's behaviour unchanged.
--
-- Idempotent — safe to apply more than once.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS rolling_summary              text,
  ADD COLUMN IF NOT EXISTS rolling_summary_updated_at   timestamptz;
