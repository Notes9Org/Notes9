/**
 * Vercel Cron — enforces the 7-day TTL on `chat_attachments`.
 *
 * Two-phase cleanup, identical semantics to the spec used to live in catalyst:
 *   Phase 1 — `expires_at < now() AND deleted_at IS NULL`
 *             → delete the storage object, set `deleted_at = now()`,
 *               keep the row as a tombstone so the UI can show
 *               "this file expired" for ~24h before it disappears.
 *   Phase 2 — `deleted_at < now() - 24 hours` → hard-delete the row.
 *
 * Auth: Vercel Cron calls send `Authorization: Bearer $CRON_SECRET`. We
 *       fail closed when the secret is unset.
 *
 * Schedule: configured in `vercel.json` (see project root). Default once
 *           per day at 03:00 UTC.
 *
 * Idempotent: re-running mid-pass is safe — both phases use small batches
 *             backed by partial indexes (`ix_chat_attachments_expires_live`,
 *             `ix_chat_attachments_deleted_at`).
 */
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

// Tuneable via env. Defaults match the catalyst spec — small batches keep
// each Vercel function call well under the 60s execution budget.
const BATCH_SIZE = Number(process.env.CHAT_ATTACHMENT_CLEANUP_BATCH ?? "500");
const MAX_ROWS_PER_RUN = Number(
  process.env.CHAT_ATTACHMENT_CLEANUP_MAX_ROWS ?? "5000",
);

// Node runtime — needs the service-role key + supabase-js storage client.
export const runtime = "nodejs";
// Belt and braces: explicitly forbid caching of this endpoint.
export const dynamic = "force-dynamic";

type StorageFailure = {
  id?: string;
  bucket?: string;
  path?: string;
  error: string;
};

type CleanupResult = {
  expired_soft_deleted: number;
  tombstones_hard_deleted: number;
  storage_delete_failures: StorageFailure[];
  ok: boolean;
};

function unauthorized(reason: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: reason },
    { status: 401 },
  );
}

function isAuthorizedCron(request: Request): { ok: boolean; reason?: string } {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return { ok: false, reason: "CRON_SECRET not configured" };
  }
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We also accept
  // an `X-Admin-Secret` header so the same endpoint is callable manually
  // (e.g. during incident response) with the same secret.
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const admin = request.headers.get("x-admin-secret") ?? "";
  if (bearer && bearer === expected) return { ok: true };
  if (admin && admin === expected) return { ok: true };
  return { ok: false, reason: "invalid cron credential" };
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = isAuthorizedCron(request);
  if (!auth.ok) return unauthorized(auth.reason ?? "unauthorized");

  const supabase = createServiceRoleClient();
  const failures: StorageFailure[] = [];

  // ── Phase 1 — expire & soft-delete storage objects ─────────────────────
  let expiredSoftDeleted = 0;
  let phase1Touched = 0;

  while (phase1Touched < MAX_ROWS_PER_RUN) {
    const { data: rows, error } = await supabase
      .from("chat_attachments")
      .select("id, storage_bucket, storage_path")
      .lt("expires_at", new Date().toISOString())
      .is("deleted_at", null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error(
        "chat_attachment_cleanup_phase1_select_failed",
        { error: error.message },
      );
      return NextResponse.json(
        {
          ok: false,
          error: `phase1 select failed: ${error.message}`,
          expired_soft_deleted: expiredSoftDeleted,
        },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) break;

    // Try to remove the storage objects first. If that fails, we still
    // tombstone the rows — an orphaned storage object is recoverable
    // (manual cleanup), but a non-tombstoned expired row would keep
    // serving the file via read_document forever.
    //
    // Group paths by bucket so we issue one `remove([...])` per bucket per
    // batch instead of one round-trip per row. `remove` accepts an array of
    // paths, so a 500-row batch collapses from 500 storage calls to ~1–2.
    const pathsByBucket = new Map<string, string[]>();
    for (const row of rows) {
      const { storage_bucket: bucket, storage_path: path } = row;
      if (bucket && path) {
        const existing = pathsByBucket.get(bucket);
        if (existing) existing.push(path);
        else pathsByBucket.set(bucket, [path]);
      }
    }

    for (const [bucket, paths] of pathsByBucket) {
      const { error: rmErr } = await supabase.storage
        .from(bucket)
        .remove(paths);
      if (rmErr) {
        failures.push({ bucket, error: rmErr.message });
        console.warn(
          "chat_attachment_storage_delete_failed",
          { bucket, paths, error: rmErr.message },
        );
      }
    }

    // Bulk-tombstone every row in the batch with a single update keyed by id.
    const batchIds = rows.map((r) => r.id).filter(Boolean);
    if (batchIds.length > 0) {
      const { error: updErr } = await supabase
        .from("chat_attachments")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", batchIds);

      if (updErr) {
        failures.push({ error: `tombstone_update: ${updErr.message}` });
        console.error(
          "chat_attachment_tombstone_update_failed",
          { ids: batchIds, error: updErr.message },
        );
      } else {
        expiredSoftDeleted += batchIds.length;
      }
    }

    phase1Touched += rows.length;
    if (rows.length < BATCH_SIZE) break; // caught up
  }

  // ── Phase 2 — hard-delete 24h-old tombstones ───────────────────────────
  let tombstonesHardDeleted = 0;
  let phase2Touched = 0;
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  while (phase2Touched < MAX_ROWS_PER_RUN) {
    const { data: rows, error } = await supabase
      .from("chat_attachments")
      .select("id")
      .lt("deleted_at", twentyFourHoursAgo)
      .limit(BATCH_SIZE);

    if (error) {
      console.error(
        "chat_attachment_cleanup_phase2_select_failed",
        { error: error.message },
      );
      // Phase 1 already committed its work; surface the partial success.
      const result: CleanupResult = {
        expired_soft_deleted: expiredSoftDeleted,
        tombstones_hard_deleted: tombstonesHardDeleted,
        storage_delete_failures: failures,
        ok: false,
      };
      return NextResponse.json(
        { ...result, error: `phase2 select failed: ${error.message}` },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) break;

    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length > 0) {
      const { error: delErr } = await supabase
        .from("chat_attachments")
        .delete()
        .in("id", ids);

      if (delErr) {
        failures.push({ error: `hard_delete: ${delErr.message}` });
        console.error(
          "chat_attachment_hard_delete_failed",
          { ids, error: delErr.message },
        );
      } else {
        tombstonesHardDeleted += ids.length;
      }
    }

    phase2Touched += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(
    "chat_attachment_cleanup_done",
    {
      expired_soft_deleted: expiredSoftDeleted,
      tombstones_hard_deleted: tombstonesHardDeleted,
      failure_count: failures.length,
    },
  );

  const result: CleanupResult = {
    expired_soft_deleted: expiredSoftDeleted,
    tombstones_hard_deleted: tombstonesHardDeleted,
    storage_delete_failures: failures,
    ok: failures.length === 0,
  };

  return NextResponse.json(result);
}

// Also accept POST so manual incident-response calls work with `curl -X POST`.
export const POST = GET;
