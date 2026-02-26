-- Allow collaborators to view and manage lab_note_protocols based on note permissions.
-- Also provides an RPC for reliably reading linked protocols from API routes.

CREATE OR REPLACE FUNCTION public.can_read_lab_note_for_user(p_lab_note_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lab_notes ln
    WHERE ln.id = p_lab_note_id
      AND (
        ln.created_by = p_user_id
        OR EXISTS (
          SELECT 1
          FROM public.lab_note_access lna
          WHERE lna.lab_note_id = ln.id
            AND lna.user_id = p_user_id
        )
        OR (
          ln.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.project_members pm
            WHERE pm.project_id = ln.project_id
              AND pm.user_id = p_user_id
          )
        )
        OR (
          ln.experiment_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.experiments e
            JOIN public.project_members pm ON pm.project_id = e.project_id
            WHERE e.id = ln.experiment_id
              AND pm.user_id = p_user_id
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_lab_note_for_user(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_edit_lab_note_for_user(p_lab_note_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lab_notes ln
    WHERE ln.id = p_lab_note_id
      AND (
        ln.created_by = p_user_id
        OR EXISTS (
          SELECT 1
          FROM public.lab_note_access lna
          WHERE lna.lab_note_id = ln.id
            AND lna.user_id = p_user_id
            AND lna.permission_level IN ('owner', 'editor')
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_lab_note_for_user(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "lab_note_protocols_select_policy" ON public.lab_note_protocols;
CREATE POLICY "lab_note_protocols_select_policy"
  ON public.lab_note_protocols
  FOR SELECT
  USING (public.can_read_lab_note_for_user(lab_note_id, auth.uid()));

DROP POLICY IF EXISTS "lab_note_protocols_insert_policy" ON public.lab_note_protocols;
CREATE POLICY "lab_note_protocols_insert_policy"
  ON public.lab_note_protocols
  FOR INSERT
  WITH CHECK (public.can_edit_lab_note_for_user(lab_note_id, auth.uid()));

DROP POLICY IF EXISTS "lab_note_protocols_delete_policy" ON public.lab_note_protocols;
CREATE POLICY "lab_note_protocols_delete_policy"
  ON public.lab_note_protocols
  FOR DELETE
  USING (public.can_edit_lab_note_for_user(lab_note_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.get_lab_note_linked_protocols(p_lab_note_id uuid)
RETURNS TABLE (
  id uuid,
  protocol_id uuid,
  protocol_name text,
  protocol_version text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_read_lab_note_for_user(p_lab_note_id, v_user_id) THEN
    RAISE EXCEPTION 'You do not have access to this lab note';
  END IF;

  RETURN QUERY
  SELECT
    lnp.id,
    lnp.protocol_id,
    p.name::text,
    p.version::text
  FROM public.lab_note_protocols lnp
  JOIN public.protocols p ON p.id = lnp.protocol_id
  WHERE lnp.lab_note_id = p_lab_note_id
  ORDER BY lnp.added_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lab_note_linked_protocols(uuid) TO authenticated;
