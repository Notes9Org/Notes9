-- scripts/091_chat_sessions_kind_metadata.sql
-- Additive: give chat_sessions a `kind` discriminator and a `metadata` jsonb bag.
--
-- Why: literature searches are being unified onto the Catalyst chat session model
-- (see plan now-this-is-a-structured-fern.md). A literature search now creates a
-- real chat_sessions row so the summary persists, survives reload, and is
-- continuable. We need to (a) tell literature sessions apart from ordinary chat
-- sessions on reload, and (b) stash the searched papers so follow-up turns can be
-- grounded in them without re-running discovery.
--
-- Purely additive — no RLS / policy changes. Existing rows default to kind='chat'.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'chat';

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Optional CHECK kept permissive so future kinds don't require a migration.
COMMENT ON COLUMN public.chat_sessions.kind IS
  'Session origin: ''chat'' (default Catalyst chat) | ''literature'' (literature search). Additive discriminator.';
COMMENT ON COLUMN public.chat_sessions.metadata IS
  'Free-form session metadata. For kind=''literature'': { literature: { query, papers: [{title,abstract,doi,pmid,year,url}] } } used to ground follow-up turns.';

-- Help the history sidebar filter/group by kind without a full scan.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_kind
  ON public.chat_sessions (user_id, kind, updated_at DESC);
