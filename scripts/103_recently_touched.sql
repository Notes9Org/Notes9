-- 103: recently_touched — the recency half of the focus signal (context backend, Slice 3)
--
-- Last-write-wins register: one row per (user, entity), refreshed on view/edit
-- by a frontend beacon. NOT an activity log — bounded by distinct entities per
-- user, so it never needs cleanup. Read path is "top-10 by touched_at" only.
-- No FK on entity_id (polymorphic); deleted entities are tolerated at read time
-- (fetch skips unresolvable ids — see core/retriever.py).

CREATE TABLE IF NOT EXISTS public.recently_touched (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'project','experiment','lab_note','protocol','literature_review',
    'sample','paper','report','data_file'
  )),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view','edit')),
  touched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity_type, entity_id)
);

-- Read path: newest first per user (PK already covers the upsert path).
CREATE INDEX IF NOT EXISTS idx_recently_touched_user_time
  ON public.recently_touched (user_id, touched_at DESC);

ALTER TABLE public.recently_touched ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recently_touched FORCE ROW LEVEL SECURITY;

-- Owner-only, all verbs ((select auth.uid()) wrap per 058 perf pattern).
DROP POLICY IF EXISTS recently_touched_owner_select ON public.recently_touched;
CREATE POLICY recently_touched_owner_select ON public.recently_touched
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS recently_touched_owner_insert ON public.recently_touched;
CREATE POLICY recently_touched_owner_insert ON public.recently_touched
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS recently_touched_owner_update ON public.recently_touched;
CREATE POLICY recently_touched_owner_update ON public.recently_touched
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS recently_touched_owner_delete ON public.recently_touched;
CREATE POLICY recently_touched_owner_delete ON public.recently_touched
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
