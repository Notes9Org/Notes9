-- Repair script for a failed/partial run of 046_sample_molecular_files_and_links.sql.
-- Run this whole file as one query if Supabase reports an unterminated dollar quote
-- around sync_sample_primary_experiment().

CREATE OR REPLACE FUNCTION public.sync_sample_primary_experiment()
RETURNS trigger
LANGUAGE plpgsql
AS $sync_sample_primary_experiment$
DECLARE
  target_sample_id uuid;
  first_experiment_id uuid;
BEGIN
  target_sample_id := COALESCE(NEW.sample_id, OLD.sample_id);

  SELECT se.experiment_id
    INTO first_experiment_id
  FROM public.sample_experiments se
  WHERE se.sample_id = target_sample_id
  ORDER BY se.linked_at ASC, se.id ASC
  LIMIT 1;

  UPDATE public.samples
  SET experiment_id = first_experiment_id,
      updated_at = now()
  WHERE id = target_sample_id
    AND experiment_id IS DISTINCT FROM first_experiment_id;

  RETURN COALESCE(NEW, OLD);
END;
$sync_sample_primary_experiment$;

DROP TRIGGER IF EXISTS sample_experiments_sync_primary_insert_update ON public.sample_experiments;
CREATE TRIGGER sample_experiments_sync_primary_insert_update
  AFTER INSERT OR UPDATE OF experiment_id, linked_at ON public.sample_experiments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sample_primary_experiment();

DROP TRIGGER IF EXISTS sample_experiments_sync_primary_delete ON public.sample_experiments;
CREATE TRIGGER sample_experiments_sync_primary_delete
  AFTER DELETE ON public.sample_experiments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sample_primary_experiment();

SELECT '047_repair_sample_primary_experiment_function applied' AS status;
