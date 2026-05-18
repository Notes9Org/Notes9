-- Experiment steps: ordered workflow steps per experiment with status and timing.
-- Each step belongs to an experiment; visibility/edit follow the experiment's project membership.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS experiment_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  step_type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')) DEFAULT 'pending',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiment_steps_experiment_id ON experiment_steps(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_steps_order ON experiment_steps(experiment_id, "order");

DROP TRIGGER IF EXISTS update_experiment_steps_updated_at ON experiment_steps;
CREATE TRIGGER update_experiment_steps_updated_at
  BEFORE UPDATE ON experiment_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: piggy-back on the experiment's project membership.
ALTER TABLE experiment_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view steps for experiments in their projects" ON experiment_steps;
CREATE POLICY "Users can view steps for experiments in their projects"
  ON experiment_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM experiments e
      JOIN project_members pm ON pm.project_id = e.project_id
      WHERE e.id = experiment_steps.experiment_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert steps for experiments in their projects" ON experiment_steps;
CREATE POLICY "Users can insert steps for experiments in their projects"
  ON experiment_steps FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM experiments e
      JOIN project_members pm ON pm.project_id = e.project_id
      WHERE e.id = experiment_steps.experiment_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update steps for experiments in their projects" ON experiment_steps;
CREATE POLICY "Users can update steps for experiments in their projects"
  ON experiment_steps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM experiments e
      JOIN project_members pm ON pm.project_id = e.project_id
      WHERE e.id = experiment_steps.experiment_id
        AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM experiments e
      JOIN project_members pm ON pm.project_id = e.project_id
      WHERE e.id = experiment_steps.experiment_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete steps for experiments in their projects" ON experiment_steps;
CREATE POLICY "Users can delete steps for experiments in their projects"
  ON experiment_steps FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM experiments e
      JOIN project_members pm ON pm.project_id = e.project_id
      WHERE e.id = experiment_steps.experiment_id
        AND pm.user_id = auth.uid()
    )
  );
