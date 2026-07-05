-- 094_artifact_sources.sql
-- Persist the "recipe" that produced each generated artifact, plus a version
-- lineage, so the UI can (a) show the code/spec behind a figure or report and
-- (b) edit/regenerate it into a new version.
--
-- WHY: today the matplotlib code create_figure_from_code runs is discarded after
-- render, and the tool inputs for the pdf/docx/xlsx/chart tools are not kept, so
-- there is no way to view or re-run what made an artifact. These columns capture:
--   source_kind  'python' (figure code) | 'spec' (the tool's structured inputs)
--   source       jsonb — python: {"code": "...", "title": ..., "dpi": ...}
--                        spec:   the tool args, with any inline image.base64
--                                blobs stripped (data_id refs kept) and capped
--                                at ~256 KB by the backend (null if it overflows,
--                                which simply disables the Edit affordance).
-- and the version chain:
--   parent_data_id  the immediately previous version (NO FK — a parent draft can
--                   be swept by the 24h TTL; the chain survives the gap)
--   root_data_id    the v1 id, denormalized onto every version so the whole
--                   chain is queryable even with holes (equals id for originals)
--   version         1-based counter
--
-- On commit the backend also copies {source_kind, source, generator, version}
-- into the promoted experiment_data.metadata (key "agent_source"), so committed
-- artifacts stay viewable/regenerable after the draft row expires.
--
-- ACCESS MODEL unchanged from 076: service-role only, RLS deny-all. The source
-- is exposed to the browser solely through an authenticated, owner-scoped
-- backend endpoint (GET /notes9/artifacts/{data_id}/source).

alter table public.agent_artifact_drafts
  add column if not exists source_kind    text,
  add column if not exists source         jsonb,
  add column if not exists parent_data_id uuid,
  add column if not exists root_data_id   uuid,
  add column if not exists version        integer not null default 1;

-- Backfill root_data_id for any pre-existing rows so the versions query
-- (where root_data_id = X) always returns at least the row itself.
update public.agent_artifact_drafts
  set root_data_id = id
  where root_data_id is null;

-- Fetch a full version chain by root.
create index if not exists idx_artifact_drafts_root
  on public.agent_artifact_drafts (root_data_id);
