-- Automatically add project creator as a lead member
-- This ensures users are automatically added to projects they create

CREATE OR REPLACE FUNCTION add_creator_to_project_members()
RETURNS TRIGGER AS $$
BEGIN
  -- Add the project creator as a lead member
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'lead')
  ON CONFLICT (project_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS add_project_creator_as_member ON projects;

-- Create trigger that fires after project insert
CREATE TRIGGER add_project_creator_as_member
  AFTER INSERT ON projects
  FOR EACH ROW
  WHEN (NEW.created_by IS NOT NULL)
  EXECUTE FUNCTION add_creator_to_project_members();

-- Backfill: Add existing project creators as members
INSERT INTO project_members (project_id, user_id, role)
SELECT p.id, p.created_by, 'lead'
FROM projects p
WHERE p.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_members pm 
    WHERE pm.project_id = p.id 
    AND pm.user_id = p.created_by
  )
ON CONFLICT (project_id, user_id) DO NOTHING;

