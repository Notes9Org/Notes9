import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import {
  inferTabularFormatFromFileName,
  workbookSnapshotToCsvBuffer,
  workbookSnapshotToXlsxBuffer,
} from "@/lib/spreadsheet-workbook"
import { USER_STORAGE_BUCKET, resolveExperimentDataStoragePath } from "@/lib/user-storage-bucket"
import { openWorkbookFromStorage } from "@/lib/data-analysis/workbook-open"

// Next 16's generated route validator types `context.params` as
// `Promise<unknown>`; accept that (a supertype of the specific shape) and
// narrow via a cast so the handler stays assignable under strictFunctionTypes.
type RouteParams = { params: Promise<unknown> }
type WorkbookRouteParams = { experimentId: string; fileId: string }

export async function GET(_request: Request, { params }: RouteParams) {
  const { experimentId, fileId } = (await params) as WorkbookRouteParams
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("experiment_data")
    .select("id, workbook_snapshot, tabular_format, file_name, file_url, metadata")
    .eq("id", fileId)
    .eq("experiment_id", experimentId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { experimentId, fileId } = (await params) as WorkbookRouteParams
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { workbook_snapshot?: unknown; sync_storage?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const snapshot = body.workbook_snapshot
  if (!snapshot || typeof snapshot !== "object") {
    return NextResponse.json({ error: "workbook_snapshot object required" }, { status: 400 })
  }

  const { data: row, error: fetchErr } = await supabase
    .from("experiment_data")
    .select("id, metadata, tabular_format, file_name, file_url")
    .eq("id", fileId)
    .eq("experiment_id", experimentId)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from("experiment_data")
    .update({
      workbook_snapshot: snapshot,
      snapshot_updated_at: now,
    })
    .eq("id", fileId)
    .eq("experiment_id", experimentId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  let file_size: number | undefined
  if (body.sync_storage) {
    const storagePath = resolveExperimentDataStoragePath({
      metadata: row.metadata as { storage_path?: string } | null,
      file_url: row.file_url,
    })
    const format = (row.tabular_format as string | null) || inferTabularFormatFromFileName(row.file_name || "")
    if (storagePath && format) {
      try {
        const buf =
          format === "csv"
            ? workbookSnapshotToCsvBuffer(snapshot as Record<string, unknown>)
            : workbookSnapshotToXlsxBuffer(snapshot as Record<string, unknown>)
        const blob = new Blob([buf], {
          type:
            format === "csv"
              ? "text/csv"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const { error: upErr } = await supabase.storage.from(USER_STORAGE_BUCKET).update(storagePath, blob, {
          cacheControl: "3600",
          upsert: true,
        })
        if (!upErr) {
          file_size = buf.byteLength
          await supabase
            .from("experiment_data")
            .update({ file_size })
            .eq("id", fileId)
            .eq("experiment_id", experimentId)
        }
      } catch (e) {
        console.error("workbook storage sync failed", e)
      }
    }
  }

  return NextResponse.json({ ok: true, snapshot_updated_at: now, file_size })
}

/**
 * SSRF allowlist for server-side fetches of stored file URLs. Permits only
 * https to the configured Supabase host (or any *.supabase.co), and rejects
 * IP-literal / private / loopback / link-local hosts.
 */
function isSafeStorageUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== "https:") return false

  const host = u.hostname.toLowerCase()

  // Block obvious internal targets (IP literals + localhost).
  if (
    host === "localhost" ||
    host === "[::1]" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || // any IPv4 literal (incl. 169.254/10/172.16-31/192.168/127)
    host.startsWith("[") // IPv6 literal
  ) {
    return false
  }

  const configured = (() => {
    try {
      return process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase()
        : null
    } catch {
      return null
    }
  })()

  return host.endsWith(".supabase.co") || (configured !== null && host === configured)
}

/**
 * Backfill snapshot by reading the file's bytes from storage (ADR-017).
 *
 * `storage_path` (org-prefixed, authenticated download through the caller's
 * own session) is authoritative; `file_url` — the old unauthenticated
 * `fetch` of a "public" URL into a bucket that is actually private — is kept
 * only as a fallback for rows written before the org-prefixed layout. See
 * `lib/data-analysis/workbook-open.ts` for the storage-path → bytes →
 * parsed-workbook decision tree and its failure reasons.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { experimentId, fileId } = (await params) as WorkbookRouteParams
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: row, error: fetchErr } = await supabase
    .from("experiment_data")
    .select("id, file_name, file_url, file_size, workbook_snapshot, metadata")
    .eq("id", fileId)
    .eq("experiment_id", experimentId)
    .maybeSingle()

  if (fetchErr || !row) {
    return NextResponse.json({ error: fetchErr?.message || "Not found" }, { status: fetchErr ? 500 : 404 })
  }
  if (row.workbook_snapshot) {
    // Idempotent: two tabs racing the same backfill both land here; the
    // second caller short-circuits on the first one's write instead of
    // re-downloading and re-parsing (ARCHITECTURE.md "Two tabs backfilling
    // the same file at once").
    return NextResponse.json({ ok: true, cached: true })
  }

  const metadata = row.metadata as { storage_path?: string } | null
  const storagePath = resolveExperimentDataStoragePath({ metadata, file_url: row.file_url })

  // Cross-org project-member case (ARCHITECTURE.md "Authorization is not the
  // problem, with one exception"): the row's SELECT policy can let a project
  // member from another org see this row, while the storage policy keys on
  // organization_id. Compare the storage path's own org prefix
  // (`{organizationId}/experiment/...`) to the caller's own org. When that
  // can't be confirmed -- the profiles query errors, or the caller's
  // profile has no organization_id yet (mid-onboarding) -- do NOT default
  // to "same org": that silent default was the actual bug (FINDINGS-01),
  // letting a real cross-org denial come back to the client as the weaker
  // `no-bytes` instead of `forbidden`. Indeterminate is treated as
  // forbidden, same as a confirmed mismatch.
  let forbidden = false
  if (storagePath) {
    const orgFromPath = storagePath.split("/")[0]
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle()
    if (profileErr || !profile?.organization_id) {
      forbidden = true
    } else if (orgFromPath && profile.organization_id !== orgFromPath) {
      forbidden = true
    }
  }

  const result = await openWorkbookFromStorage({
    fileName: row.file_name,
    storagePath,
    legacyFileUrl: row.file_url,
    forbidden,
    isSafeStorageUrl,
    storage: supabase.storage.from(USER_STORAGE_BUCKET),
    knownSizeBytes: typeof row.file_size === "number" ? row.file_size : null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: "unreadable", reason: result.reason }, { status: 422 })
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from("experiment_data")
    .update({
      workbook_snapshot: result.snapshot,
      snapshot_updated_at: now,
      tabular_format: result.tabularFormat,
    })
    .eq("id", fileId)
    .eq("experiment_id", experimentId)

  if (updateErr) {
    // Never fail an open because the cache write failed (ARCHITECTURE.md
    // "Backfill succeeds, snapshot write fails"): the parsed workbook is
    // still handed back so the caller can render it immediately even though
    // the next GET won't see it cached until a retry succeeds.
    console.error("workbook snapshot cache write failed", updateErr)
    return NextResponse.json({
      ok: true,
      snapshot_updated_at: null,
      tabular_format: result.tabularFormat,
      workbook_snapshot: result.snapshot,
    })
  }

  return NextResponse.json({
    ok: true,
    snapshot_updated_at: now,
    tabular_format: result.tabularFormat,
    // Additive field (old clients that only check `ok`/`snapshot_updated_at`
    // and then re-GET are unaffected) so a caller doesn't have to make a
    // second round trip just to get bytes this request already parsed.
    workbook_snapshot: result.snapshot,
  })
}
