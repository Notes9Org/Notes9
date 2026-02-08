-- Unique name constraints: project names per organization, experiment names per project, lab note titles per experiment.
-- Same name is allowed in different organizations/projects/experiments.
-- Duplicate rows are renamed (suffix with id snippet) before adding constraints.

-- Deduplicate project names per organization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_organization_name_unique'
  ) THEN
    WITH dupes AS (
      SELECT id, name,
        ROW_NUMBER() OVER (PARTITION BY organization_id, name ORDER BY id) AS rn
      FROM projects
    ),
    to_update AS (
      SELECT id, name || ' (' || left(id::text, 8) || ')' AS new_name
      FROM dupes
      WHERE rn > 1
    )
    UPDATE projects p
    SET name = to_update.new_name
    FROM to_update
    WHERE p.id = to_update.id;

    ALTER TABLE projects
      ADD CONSTRAINT projects_organization_name_unique UNIQUE (organization_id, name);
  END IF;
END $$;

-- Deduplicate experiment names within each project so the unique constraint can be applied.
-- Keeps the first (by id) and renames others to "name (uuid-snippet)".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'experiments_project_name_unique'
  ) THEN
    WITH dupes AS (
      SELECT id, name,
        ROW_NUMBER() OVER (PARTITION BY project_id, name ORDER BY id) AS rn
      FROM experiments
    ),
    to_update AS (
      SELECT id, name || ' (' || left(id::text, 8) || ')' AS new_name
      FROM dupes
      WHERE rn > 1
    )
    UPDATE experiments e
    SET name = to_update.new_name
    FROM to_update
    WHERE e.id = to_update.id;

    ALTER TABLE experiments
      ADD CONSTRAINT experiments_project_name_unique UNIQUE (project_id, name);
  END IF;
END $$;

-- Deduplicate lab note titles per experiment, then add unique index
DO $$
BEGIN
  WITH dupes AS (
    SELECT id, title, experiment_id,
      ROW_NUMBER() OVER (PARTITION BY experiment_id, title ORDER BY id) AS rn
    FROM lab_notes
    WHERE experiment_id IS NOT NULL
  ),
  to_update AS (
    SELECT id, title || ' (' || left(id::text, 8) || ')' AS new_title
    FROM dupes
    WHERE rn > 1
  )
  UPDATE lab_notes ln
  SET title = to_update.new_title
  FROM to_update
  WHERE ln.id = to_update.id;
END $$;

-- Lab notes: one title per experiment (partial index so we only enforce when experiment_id is set)
DROP INDEX IF EXISTS lab_notes_experiment_title_unique;
CREATE UNIQUE INDEX lab_notes_experiment_title_unique
  ON lab_notes (experiment_id, title)
  WHERE experiment_id IS NOT NULL;
