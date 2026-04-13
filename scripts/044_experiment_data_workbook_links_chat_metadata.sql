-- Tabular workbook snapshots, entity links, chat message metadata, experiment_data policies
-- Run in Supabase SQL editor or migration pipeline.

-- ---------------------------------------------------------------------------
-- experiment_data: workbook snapshot + lineage + denormalized project_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.experiment_data
  ADD COLUMN IF NOT EXISTS workbook_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS tabular_format text,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_chat_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_agent_message_id uuid;

COMMENT ON COLUMN public.experiment_data.source_agent_message_id IS 'Optional lineage when row was created from an agent thread (FK to agent_messages not enforced for migration ordering)';

COMMENT ON COLUMN public.experiment_data.workbook_snapshot IS 'Univer-style workbook JSON; canonical editable state for CSV/XLSX';
COMMENT ON COLUMN public.experiment_data.tabular_format IS 'csv | xlsx | xls when file is tabular';

CREATE INDEX IF NOT EXISTS idx_experiment_data_project_id ON public.experiment_data(project_id);
CREATE INDEX IF NOT EXISTS idx_experiment_data_tabular_format ON public.experiment_data(tabular_format) WHERE tabular_format IS NOT NULL;

-- Keep project_id aligned with experiment.project_id
CREATE OR REPLACE FUNCTION public.sync_experiment_data_project_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.experiment_id IS NOT NULL THEN
    SELECT e.project_id INTO NEW.project_id
    FROM public.experiments e
    WHERE e.id = NEW.experiment_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_experiment_data_sync_project ON public.experiment_data;
CREATE TRIGGER trg_experiment_data_sync_project
  BEFORE INSERT OR UPDATE OF experiment_id ON public.experiment_data
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_experiment_data_project_id();

-- ---------------------------------------------------------------------------
-- Junction: many-to-many links from experiment_data to other entities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.experiment_data_entity_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_data_id uuid NOT NULL REFERENCES public.experiment_data(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  link_role text NOT NULL DEFAULT 'embed_reference',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experiment_data_entity_links_unique
    UNIQUE (experiment_data_id, entity_type, entity_id, link_role)
);

CREATE INDEX IF NOT EXISTS idx_experiment_data_entity_links_entity
  ON public.experiment_data_entity_links(entity_type, entity_id);

COMMENT ON TABLE public.experiment_data_entity_links IS 'Links tabular files to lab notes, protocols, papers, profiles, etc.';

ALTER TABLE public.experiment_data_entity_links ENABLE ROW LEVEL SECURITY;

-- Helper: user is member of project that owns the experiment for this experiment_data row
CREATE POLICY "experiment_data_entity_links_select"
  ON public.experiment_data_entity_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiment_data ed
      JOIN public.experiments e ON e.id = ed.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
      WHERE ed.id = experiment_data_entity_links.experiment_data_id
    )
  );

CREATE POLICY "experiment_data_entity_links_insert"
  ON public.experiment_data_entity_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiment_data ed
      JOIN public.experiments e ON e.id = ed.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
      WHERE ed.id = experiment_data_entity_links.experiment_data_id
    )
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY "experiment_data_entity_links_update"
  ON public.experiment_data_entity_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiment_data ed
      JOIN public.experiments e ON e.id = ed.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
      WHERE ed.id = experiment_data_entity_links.experiment_data_id
    )
  );

CREATE POLICY "experiment_data_entity_links_delete"
  ON public.experiment_data_entity_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiment_data ed
      JOIN public.experiments e ON e.id = ed.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
      WHERE ed.id = experiment_data_entity_links.experiment_data_id
    )
  );

-- ---------------------------------------------------------------------------
-- chat_messages: metadata for attachments (future copy-to-project)
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.chat_messages.metadata IS 'Structured extras e.g. attachments: [{ kind, storage_path, title, experiment_data_id }]';

-- ---------------------------------------------------------------------------
-- experiment_data RLS (if missing in deployment — idempotent policy names)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'experiment_data' AND policyname = 'experiment_data_select_project_members'
  ) THEN
    CREATE POLICY "experiment_data_select_project_members"
      ON public.experiment_data FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.experiments e
          JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
          WHERE e.id = experiment_data.experiment_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'experiment_data' AND policyname = 'experiment_data_insert_project_members'
  ) THEN
    CREATE POLICY "experiment_data_insert_project_members"
      ON public.experiment_data FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.experiments e
          JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
          WHERE e.id = experiment_data.experiment_id
        )
        AND (uploaded_by IS NULL OR uploaded_by = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'experiment_data' AND policyname = 'experiment_data_update_project_members'
  ) THEN
    CREATE POLICY "experiment_data_update_project_members"
      ON public.experiment_data FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.experiments e
          JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
          WHERE e.id = experiment_data.experiment_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'experiment_data' AND policyname = 'experiment_data_delete_project_members'
  ) THEN
    CREATE POLICY "experiment_data_delete_project_members"
      ON public.experiment_data FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.experiments e
          JOIN public.project_members pm ON pm.project_id = e.project_id AND pm.user_id = auth.uid()
          WHERE e.id = experiment_data.experiment_id
        )
      );
  END IF;
END $$;
