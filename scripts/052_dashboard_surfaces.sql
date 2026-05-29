-- Dashboard surfaces: sticky whiteboard notes and calendar events for the ELN dashboard.
-- whiteboard_notes: freeform canvas notes per user/project board.
-- calendar_events:  timeline entries tied to user, optional project/experiment.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- Table: whiteboard_notes
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whiteboard_notes (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  project_id UUID        NULL        REFERENCES projects(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL DEFAULT 'paper'
               CHECK (kind IN ('lemon','mint','cloud','lilac','coral','paper','ai')),
  tag        TEXT,
  body       TEXT        NOT NULL DEFAULT '',
  foot       TEXT,
  x          INT         NOT NULL DEFAULT 24,
  y          INT         NOT NULL DEFAULT 24,
  is_ai      BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_whiteboard_notes_updated_at
  BEFORE UPDATE ON whiteboard_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_whiteboard_notes_user_project ON whiteboard_notes(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_notes_user_id      ON whiteboard_notes(user_id);

-- RLS: users can only see and modify their own notes
ALTER TABLE whiteboard_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own whiteboard notes"
  ON whiteboard_notes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own whiteboard notes"
  ON whiteboard_notes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own whiteboard notes"
  ON whiteboard_notes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own whiteboard notes"
  ON whiteboard_notes FOR DELETE
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Table: calendar_events
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE,
  project_id    UUID        NULL        REFERENCES projects(id)   ON DELETE CASCADE,
  experiment_id UUID        NULL        REFERENCES experiments(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  meta          TEXT,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NULL,
  tone          TEXT        NOT NULL DEFAULT 'ink'
                  CHECK (tone IN ('ink','leaf','accent','warning')),
  done          BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start    ON calendar_events(user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_project  ON calendar_events(user_id, project_id);

-- RLS: users can only see and modify their own events
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calendar events"
  ON calendar_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own calendar events"
  ON calendar_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own calendar events"
  ON calendar_events FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own calendar events"
  ON calendar_events FOR DELETE
  USING (user_id = auth.uid());
