-- Dashboard tasks: daily task management for researchers (To-Do panel)
-- Each task belongs to a user; optional due datetime and priority.
-- Experiment/project refs are stored inline in title as {{experiment:<id>}} / {{project:<id>}}.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS dashboard_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_dashboard_tasks_updated_at
  BEFORE UPDATE ON dashboard_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_dashboard_tasks_user_id ON dashboard_tasks(user_id);
-- RLS: users can only see and modify their own tasks
ALTER TABLE dashboard_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dashboard tasks"
  ON dashboard_tasks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own dashboard tasks"
  ON dashboard_tasks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own dashboard tasks"
  ON dashboard_tasks FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own dashboard tasks"
  ON dashboard_tasks FOR DELETE
  USING (user_id = auth.uid());
