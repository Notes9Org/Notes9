/**
 * Vercel Cron — enforces the TTL on `agent_artifact_drafts`.
 *
 * AI-generated files (PDF/Word/Excel/chart/figure) land in the private `user`
 * bucket under `{org}/agent-drafts/{session}/{data_id}/{file}` with a row in
 * `agent_artifact_drafts` BEFORE the user decides to keep them. When the user
 * clicks "Save to Data files" the draft is committed (copied to the canonical
 * experiment path, `committed_at` stamped). Drafts the user never saves would
 * otherwise accumulate forever in DB + storage — this job reaps them.
 *
 * Single-phase (drafts need no UI tombstone — an unsaved draft just vanishes):
 *   `committed_at IS NULL AND expires_at < now()`
 *     → remove the storage object from the `user` bucket, then delete the row.
 *   Committed drafts are left untouched (the file lives in the experiment now;
 *   the draft storage object was already removed at commit time).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We fail closed
 *       when the secret is unset. `X-Admin-Secret` is also accepted for manual
 *       incident-response calls.
 *
 * Schedule: configured in `vercel.json`. Default once per day at 03:10 UTC
 *           (offset from chat-attachments at 03:00 so they don't contend).
 *
 * Idempotent: re-running mid-pass is safe — the batch select is backed by the
 *             partial index `idx_artifact_drafts_expiry` (live drafts by expiry).
 */
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

// Tuneable via env. Small batches keep each call well under the 60s budget.
const BATCH_SIZE = Number(process.env.AGENT_DRAFT_CLEANUP_BATCH ?? "500");
const MAX_ROWS_PER_RUN = Number(
  process.env.AGENT_DRAFT_CLEANUP_MAX_ROWS ?? "5000",
);
// Bucket the agent stages drafts in — must match catalyst's NOTES9_USER_BUCKET
// (artifact_storage.py USER_BUCKET, default "user").
const USER_BUCKET = process.env.NOTES9_USER_BUCKET ?? "user";

// Node runtime — needs the service-role key + supabase-js storage client.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StorageFailure = { bucket?: string; error: string };

type CleanupResult = {
  drafts_deleted: number;
  storage_delete_failures: StorageFailure[];
  ok: boolean;
};

function unauthorized(reason: string): NextResponse {
  return NextResponse.json({ ok: false, error: reason }, { status: 401 });
}

function isAuthorizedCron(request: Request): { ok: boolean; reason?: string } {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: "CRON_SECRET not configured" };
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
  let draftsDeleted = 0;
  let touched = 0;

  while (touched < MAX_ROWS_PER_RUN) {
    const { data: rows, error } = await supabase
      .from("agent_artifact_drafts")
      .select("id, storage_path")
      .is("committed_at", null)
      .lt("expires_at", new Date().toISOString())
      .limit(BATCH_SIZE);

    if (error) {
      console.error("agent_draft_cleanup_select_failed", {
        error: error.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error: `select failed: ${error.message}`,
          drafts_deleted: draftsDeleted,
        },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) break;

    // Remove storage objects first. All drafts live in the same `user` bucket,
    // so one `remove([...])` per batch instead of one round-trip per row. If
    // storage removal fails we still delete the rows — an orphaned object is
    // recoverable by manual cleanup, but a kept expired row would mislead the
    // commit path into thinking the draft is still live.
    const paths = rows
      .map((r) => r.storage_path as string | null)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage
        .from(USER_BUCKET)
        .remove(paths);
      if (rmErr) {
        failures.push({ bucket: USER_BUCKET, error: rmErr.message });
        console.warn("agent_draft_storage_delete_failed", {
          bucket: USER_BUCKET,
          count: paths.length,
          error: rmErr.message,
        });
      }
    }

    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length > 0) {
      const { error: delErr } = await supabase
        .from("agent_artifact_drafts")
        .delete()
        .in("id", ids);
      if (delErr) {
        failures.push({ error: `row_delete: ${delErr.message}` });
        console.error("agent_draft_row_delete_failed", {
          ids,
          error: delErr.message,
        });
      } else {
        draftsDeleted += ids.length;
      }
    }

    touched += rows.length;
    if (rows.length < BATCH_SIZE) break; // caught up
  }

  console.log("agent_draft_cleanup_done", {
    drafts_deleted: draftsDeleted,
    failure_count: failures.length,
  });

  const result: CleanupResult = {
    drafts_deleted: draftsDeleted,
    storage_delete_failures: failures,
    ok: failures.length === 0,
  };
  return NextResponse.json(result);
}

// Also accept POST so manual incident-response calls work with `curl -X POST`.
export const POST = GET;
