-- Create votes table for message feedback
CREATE TABLE IF NOT EXISTS message_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_upvoted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_message_votes_chat_id ON message_votes(chat_id);
CREATE INDEX IF NOT EXISTS idx_message_votes_message_id ON message_votes(message_id);
CREATE INDEX IF NOT EXISTS idx_message_votes_user_id ON message_votes(user_id);

-- Enable RLS
ALTER TABLE message_votes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own votes
CREATE POLICY "Users can view own votes"
  ON message_votes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own votes
CREATE POLICY "Users can insert own votes"
  ON message_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own votes
CREATE POLICY "Users can update own votes"
  ON message_votes FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_message_votes_updated_at
  BEFORE UPDATE ON message_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

