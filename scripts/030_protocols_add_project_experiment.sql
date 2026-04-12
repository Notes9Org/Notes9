-- Migration: Add project_id and experiment_id to protocols table
-- Run this in the Supabase SQL Editor (or your migration runner) so PostgREST
-- picks up the new columns — otherwise the app will save protocols without context links.
--
-- These columns are nullable at DB level to preserve existing data.
-- The application UI requires both for newly created protocols; existing rows stay valid.

ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS protocols_project_id_idx ON public.protocols(project_id);
CREATE INDEX IF NOT EXISTS protocols_experiment_id_idx ON public.protocols(experiment_id);

-- No RLS changes required: existing org-scoped policies cover these columns.
