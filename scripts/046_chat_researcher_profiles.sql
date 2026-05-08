-- Chat researcher profile: aggregated researcher context and Graffify graph_data for dashboard.
-- RLS: users can read their own row (writes typically via service role / backend).
--
-- If a different script errors with "syntax error at or near USER" on `embedding USER-DEFINED`,
-- that dump syntax is invalid in PostgreSQL. Use scripts/047_chat_memories.sql (pgvector) or
-- replace USER-DEFINED with extensions.vector(<dim>) after enabling the vector extension.

CREATE TABLE IF NOT EXISTS public.chat_researcher_profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  focus_areas TEXT[] NOT NULL DEFAULT '{}',
  active_targets TEXT[] NOT NULL DEFAULT '{}',
  preferred_assays TEXT[] NOT NULL DEFAULT '{}',
  open_questions TEXT[] NOT NULL DEFAULT '{}',
  research_summary TEXT,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  memories_extracted INTEGER NOT NULL DEFAULT 0,
  graph_data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_chat_researcher_profiles_updated_at ON public.chat_researcher_profiles;
CREATE TRIGGER update_chat_researcher_profiles_updated_at
  BEFORE UPDATE ON public.chat_researcher_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.chat_researcher_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own chat researcher profile" ON public.chat_researcher_profiles;
CREATE POLICY "Users can read own chat researcher profile"
  ON public.chat_researcher_profiles
  FOR SELECT
  USING (user_id = auth.uid());
