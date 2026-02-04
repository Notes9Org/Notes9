-- Migration: Create lab_note_protocols junction table
-- This allows linking protocols to lab notes

-- Create the junction table
CREATE TABLE IF NOT EXISTS public.lab_note_protocols (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  lab_note_id uuid NOT NULL,
  protocol_id uuid NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lab_note_protocols_pkey PRIMARY KEY (id),
  CONSTRAINT lab_note_protocols_lab_note_id_fkey FOREIGN KEY (lab_note_id) REFERENCES public.lab_notes(id) ON DELETE CASCADE,
  CONSTRAINT lab_note_protocols_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id) ON DELETE CASCADE,
  CONSTRAINT lab_note_protocols_unique UNIQUE (lab_note_id, protocol_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_lab_note_protocols_lab_note_id ON lab_note_protocols(lab_note_id);
CREATE INDEX IF NOT EXISTS idx_lab_note_protocols_protocol_id ON lab_note_protocols(protocol_id);

-- Enable RLS
ALTER TABLE lab_note_protocols ENABLE ROW LEVEL SECURITY;

-- Grant table access to authenticated users (required in addition to RLS)
GRANT SELECT, INSERT, DELETE ON TABLE public.lab_note_protocols TO authenticated;

-- RLS Policies
-- Users can view lab note protocols for their notes OR their protocols (bidirectional)
CREATE POLICY "lab_note_protocols_select_policy" ON lab_note_protocols FOR SELECT USING (
  EXISTS (SELECT 1 FROM lab_notes WHERE lab_notes.id = lab_note_protocols.lab_note_id AND lab_notes.created_by = auth.uid())
  OR
  EXISTS (SELECT 1 FROM protocols WHERE protocols.id = lab_note_protocols.protocol_id AND protocols.created_by = auth.uid())
);

-- Users can insert lab note protocols for their notes
CREATE POLICY "lab_note_protocols_insert_policy" ON lab_note_protocols FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM lab_notes WHERE lab_notes.id = lab_note_id AND lab_notes.created_by = auth.uid())
);

-- Users can delete lab note protocols for their notes
CREATE POLICY "lab_note_protocols_delete_policy" ON lab_note_protocols FOR DELETE USING (
  EXISTS (SELECT 1 FROM lab_notes WHERE lab_notes.id = lab_note_protocols.lab_note_id AND lab_notes.created_by = auth.uid())
);
