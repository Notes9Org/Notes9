/**
 * Vercel Cron — enforces the 7-day TTL on STAGED (read-without-library)
 * `literature_reviews` rows (migration 092).
 *
 * A staged row is a paper the user opened to read but never added to their library.
 * It carries `catalog_placement='staging'` and `staged_expires_at = stage_time + 7d`.
 * Promotion to the library ("Save to library") clears `staged_expires_at`, so ONLY
 * genuinely-abandoned reads ever match here — a single hard-delete phase is safe (no
 * tombstone grace needed; there is nothing to "undo" about an un-saved read).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; fail closed when unset.
 * Schedule: configure in `vercel.json` (daily, alongside cleanup-chat-attachments).
 * Idempotent + batched, backed by the partial index `idx_literature_reviews_staged_expiry`.
 *
 * Note: an associated imported PDF in storage may be left orphaned (recoverable via a
 * manual sweep); the row — which is what surfaces the paper in the UI and via
 * read_document — is removed, which is the user-visible contract that matters.
 */
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const BATCH_SIZE = Number(process.env.STAGED_LITERATURE_CLEANUP_BATCH ?? "500");
const MAX_ROWS_PER_RUN = Number(
  process.env.STAGED_LITERATURE_CLEANUP_MAX_ROWS ?? "5000",
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let hardDeleted = 0;
  let touched = 0;
  const nowIso = new Date().toISOString();

  while (touched < MAX_ROWS_PER_RUN) {
    const { data: rows, error } = await supabase
      .from("literature_reviews")
      .select("id")
      .eq("catalog_placement", "staging")
      .not("staged_expires_at", "is", null)
      .lt("staged_expires_at", nowIso)
      .limit(BATCH_SIZE);

    if (error) {
      console.error("staged_literature_cleanup_select_failed", {
        error: error.message,
      });
      return NextResponse.json(
        { ok: false, error: `select failed: ${error.message}`, hard_deleted: hardDeleted },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) break;

    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length > 0) {
      const { error: delErr } = await supabase
        .from("literature_reviews")
        .delete()
        .in("id", ids);

      if (delErr) {
        console.error("staged_literature_hard_delete_failed", {
          ids,
          error: delErr.message,
        });
        return NextResponse.json(
          { ok: false, error: `delete failed: ${delErr.message}`, hard_deleted: hardDeleted },
          { status: 500 },
        );
      }
      hardDeleted += ids.length;
    }

    touched += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log("staged_literature_cleanup_done", { hard_deleted: hardDeleted });
  return NextResponse.json({ ok: true, hard_deleted: hardDeleted });
}

// Also accept POST for manual incident-response calls.
export const POST = GET;
