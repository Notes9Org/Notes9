import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  buildSpreadsheetWorkbookSnapshot,
  inferTabularFormatFromFileName,
  readSpreadsheetWorkbook,
  workbookSnapshotToCsvBuffer,
  workbookSnapshotToXlsxBuffer,
} from "@/lib/spreadsheet-workbook"

type RouteParams = { params: Promise<{ experimentId: string; fileId: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  const { experimentId, fileId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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
  const { experimentId, fileId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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
    const meta = row.metadata as { storage_path?: string } | null
    const storagePath = meta?.storage_path
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
        const { error: upErr } = await supabase.storage.from("experiment-files").update(storagePath, blob, {
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

/** Backfill snapshot from public file URL (server-side fetch). */
export async function POST(request: Request, { params }: RouteParams) {
  const { experimentId, fileId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: row, error: fetchErr } = await supabase
    .from("experiment_data")
    .select("id, file_name, file_url, workbook_snapshot")
    .eq("id", fileId)
    .eq("experiment_id", experimentId)
    .maybeSingle()

  if (fetchErr || !row) {
    return NextResponse.json({ error: fetchErr?.message || "Not found" }, { status: fetchErr ? 500 : 404 })
  }
  if (row.workbook_snapshot) {
    return NextResponse.json({ ok: true, cached: true })
  }
  if (!row.file_url || !row.file_name) {
    return NextResponse.json({ error: "No file to parse" }, { status: 400 })
  }

  const res = await fetch(row.file_url)
  if (!res.ok) {
    return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 })
  }
  const arrayBuffer = await res.arrayBuffer()
  const wb = readSpreadsheetWorkbook(arrayBuffer, row.file_name)
  const snapshot = buildSpreadsheetWorkbookSnapshot(row.file_name, wb)
  const tabular_format = inferTabularFormatFromFileName(row.file_name)

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from("experiment_data")
    .update({
      workbook_snapshot: snapshot,
      snapshot_updated_at: now,
      tabular_format,
    })
    .eq("id", fileId)
    .eq("experiment_id", experimentId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, snapshot_updated_at: now, tabular_format })
}
