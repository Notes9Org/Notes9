-- Prevent duplicate pending invitations per lab note + email.
-- Keep newest pending invitation and revoke older duplicates first.

WITH ranked_pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lab_note_id, LOWER(email)
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.lab_note_invitations
  WHERE status = 'pending'
)
UPDATE public.lab_note_invitations AS invitations
SET
  status = 'revoked',
  updated_at = NOW()
FROM ranked_pending AS ranked
WHERE invitations.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_note_invitations_pending_unique_email
  ON public.lab_note_invitations (lab_note_id, LOWER(email))
  WHERE status = 'pending';
