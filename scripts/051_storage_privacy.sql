-- 051_storage_privacy.sql
--
-- N9-6 (SEC-005): the `user` bucket was created public=true
-- (036_literature_catalog_placement.sql) and experiment-files is public by
-- default too. The fix was written but left commented out
-- (057_security_hardening.sql §4) pending a client-side audit of
-- getPublicUrl() callers, and this file -- reserved for exactly that fix --
-- shipped empty. CLAUDE.md now states the invariant directly: "The `user`
-- storage bucket is PRIVATE. Use signed URLs, persist storagePath and re-sign
-- on read; never store or render public URLs" -- the client-side migration to
-- createSignedUrl() has happened. This backfills the placeholder so a
-- fresh/DR environment rebuilt from tracked SQL is private by default instead
-- of silently reproducing the public=true bucket.
--
-- Idempotent; safe to re-run.

UPDATE storage.buckets SET public = false WHERE id IN ('user', 'experiment-files');

-- Verify:
--   SELECT id, public FROM storage.buckets WHERE id IN ('user', 'experiment-files');
--   -- expect public = false for both rows.

-- DOWN (rollback -- re-opens both buckets to unauthenticated CDN reads; only
-- run this if a verified regression requires reverting):
-- UPDATE storage.buckets SET public = true WHERE id IN ('user', 'experiment-files');
