-- Writing docs (papers) can optionally link to an experiment, matching
-- lab_notes / experiment_data / literature_reviews which already carry both
-- project_id and experiment_id. Nullable by design: the Writing creation flow
-- treats both project and experiment as optional.
-- No RLS change needed — papers policies are owner-scoped (created_by = auth.uid()).

ALTER TABLE public.papers
  ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES public.experiments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_papers_experiment_id ON public.papers(experiment_id);
