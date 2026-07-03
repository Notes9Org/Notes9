-- 093_session_active_attachments.sql
--
-- Persists the attachment/tagged-record references a chat session is currently
-- "focused" on, so a follow-up turn that does NOT re-send the attachment (e.g.
-- "now expand section 3") can re-inject the same focused content instead of
-- silently losing it and falling back to a workspace search.
--
-- We store only lightweight REFERENCES (storage path / record id / mime), never
-- the file bytes — the preflight re-loads the content from storage as usual.
-- Nullable, no RLS change, no back-fill, no default rewrites. A session without
-- this column simply inherits today's behaviour (attachments only live for the
-- request that sent them).
--
-- Idempotent — safe to apply more than once.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS active_attachments            jsonb,
  ADD COLUMN IF NOT EXISTS active_attachments_updated_at timestamptz;
