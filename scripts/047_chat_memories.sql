-- Chat memories with embeddings (pgvector). Schema dumps often show "USER-DEFINED" for
-- custom types — that is not valid DDL. Use extensions.vector(dim) instead.
-- Adjust 1536 if your embedding model uses a different dimension.
-- Requires: 019_chat_sessions.sql, 020_chat_messages.sql (FK targets).

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.chat_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  memory_type TEXT NOT NULL CHECK (
    memory_type = ANY (
      ARRAY[
        'assay_result'::text,
        'target_decision'::text,
        'hypothesis'::text,
        'open_question'::text,
        'compound_data'::text,
        'background'::text
      ]
    )
  ),
  entities TEXT[] NOT NULL DEFAULT '{}'::text[],
  importance DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK (
    importance >= 0::double precision
    AND importance <= 1::double precision
  ),
  is_invalidated BOOLEAN NOT NULL DEFAULT false,
  derived_from_vote BOOLEAN NOT NULL DEFAULT false,
  source_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_memories_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_chat_memories_user_id ON public.chat_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_memories_session_id ON public.chat_memories(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_memories_created_at ON public.chat_memories(created_at DESC);

ALTER TABLE public.chat_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_memories_select_own" ON public.chat_memories;
DROP POLICY IF EXISTS "chat_memories_insert_own" ON public.chat_memories;
DROP POLICY IF EXISTS "chat_memories_update_own" ON public.chat_memories;
DROP POLICY IF EXISTS "chat_memories_delete_own" ON public.chat_memories;

CREATE POLICY "chat_memories_select_own"
  ON public.chat_memories FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "chat_memories_insert_own"
  ON public.chat_memories FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_memories_update_own"
  ON public.chat_memories FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_memories_delete_own"
  ON public.chat_memories FOR DELETE
  USING (user_id = auth.uid());
