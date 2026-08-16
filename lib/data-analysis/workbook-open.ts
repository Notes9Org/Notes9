/**
 * Slice 01 (ADR-017): "open a data file by its storage path, and stop
 * guessing which files are tabular". This is the storage-path → bytes →
 * parsed-workbook decision tree the workbook POST route runs, pulled out of
 * the route so it is unit-testable without mocking Next.js request/response
 * plumbing or a full Supabase client.
 *
 * Order mirrors ARCHITECTURE.md's Interfaces §1 pseudocode:
 *   1. `forbidden` short-circuits everything else — a cross-org project
 *      member's download will never succeed (storage RLS keys on
 *      organization_id, the row's SELECT policy does not), so there is
 *      nothing to gain by attempting it, and no ambiguous storage error to
 *      interpret afterward (Supabase Storage returns the same "not found"
 *      for "denied" and "genuinely missing", by design — see the route for
 *      how `forbidden` gets computed instead, from the storage path's own
 *      org prefix).
 *   2. `storagePath` (authenticated download, org-scoped RLS) is
 *      authoritative when present — it exists on every row written since the
 *      org-prefixed layout.
 *   3. `legacyFileUrl` is the fallback for pre-migration rows only, and
 *      keeps its own SSRF allowlist (`isSafeStorageUrl`, still owned by the
 *      route since it depends on `NEXT_PUBLIC_SUPABASE_URL`).
 *   4. Anything left with no bytes, bytes too big to parse safely, an
 *      extension that was never a spreadsheet, or bytes that fail to parse
 *      despite looking tabular, gets one of the five reasons the route
 *      returns as `422 { error: "unreadable", reason }`.
 */
import {
  buildSpreadsheetWorkbookSnapshot,
  inferTabularFormatFromFileName,
  readSpreadsheetWorkbook,
  type TabularFormat,
  type UniverWorkbookSnapshot,
} from "@/lib/spreadsheet-workbook"

/**
 * Bound on parsed-file size, checked post-download and pre-parse. A single
 * 50MB xlsx re-encodes into a Univer snapshot many times its source size;
 * this is what keeps one file from exhausting the route's memory
 * (ARCHITECTURE.md failure mode "A 50MB xlsx").
 */
export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024

export type WorkbookOpenReason = "not-a-spreadsheet" | "no-bytes" | "parse-failed" | "forbidden" | "too-large"

export type WorkbookOpenResult =
  | { ok: true; snapshot: UniverWorkbookSnapshot; tabularFormat: TabularFormat | null }
  | { ok: false; reason: WorkbookOpenReason }

/** Minimal shape of `supabase.storage.from(bucket)` — narrow on purpose so
 *  tests don't have to construct a real Supabase client. */
export interface WorkbookStorageDownloader {
  download(path: string): Promise<{ data: Blob | null; error: unknown }>
}

/**
 * Extensions this route is willing to attempt a parse against. Deliberately
 * wider than `inferTabularFormatFromFileName`, which excludes `.tsv` on
 * purpose (a non-null result there arms the PATCH route's overwrite-on-save
 * path — see that function's own comment). Here we only ever read, so a
 * `.tsv` is a legitimate thing to try, and this gate exists only to stop a
 * PDF or image from being silently parsed as one column of garbage text —
 * SheetJS's plain-text fallback parser accepts almost any bytes, and does
 * not throw for those.
 */
function looksLikeTabularFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".xlsx") || lower.endsWith(".xls")
}

export interface OpenWorkbookFromStorageInput {
  fileName: string | null
  storagePath: string | null
  legacyFileUrl: string | null
  /**
   * Cross-org project-member case (ARCHITECTURE.md "Authorization is not
   * the problem, with one exception"). Computed by the caller by comparing
   * the storage path's org prefix to the caller's own `organization_id`
   * rather than trying to read intent out of a storage error.
   */
  forbidden: boolean
  isSafeStorageUrl: (url: string) => boolean
  storage: WorkbookStorageDownloader
  fetchImpl?: (url: string) => Promise<Response>
  /** Known size (bytes) from the row, if any — lets an already-known-huge
   *  file skip the download entirely instead of paying for it just to reject it. */
  knownSizeBytes?: number | null
}

export async function openWorkbookFromStorage(input: OpenWorkbookFromStorageInput): Promise<WorkbookOpenResult> {
  const {
    fileName,
    storagePath,
    legacyFileUrl,
    forbidden,
    isSafeStorageUrl,
    storage,
    fetchImpl = fetch,
    knownSizeBytes,
  } = input

  if (forbidden) return { ok: false, reason: "forbidden" }
  if (typeof knownSizeBytes === "number" && knownSizeBytes > MAX_WORKBOOK_BYTES) {
    return { ok: false, reason: "too-large" }
  }
  if (!fileName) return { ok: false, reason: "no-bytes" }

  let bytes: ArrayBuffer | null = null

  if (storagePath) {
    const { data } = await storage.download(storagePath)
    if (data) bytes = await data.arrayBuffer()
  }
  if (!bytes && legacyFileUrl && isSafeStorageUrl(legacyFileUrl)) {
    const res = await fetchImpl(legacyFileUrl)
    if (res.ok) bytes = await res.arrayBuffer()
  }

  if (!bytes) return { ok: false, reason: "no-bytes" }
  if (bytes.byteLength > MAX_WORKBOOK_BYTES) return { ok: false, reason: "too-large" }
  if (!looksLikeTabularFile(fileName)) return { ok: false, reason: "not-a-spreadsheet" }

  try {
    const wb = readSpreadsheetWorkbook(bytes, fileName)
    const snapshot = buildSpreadsheetWorkbookSnapshot(fileName, wb)
    return { ok: true, snapshot, tabularFormat: inferTabularFormatFromFileName(fileName) }
  } catch {
    // Corrupt/truncated file with a tabular extension — distinct from
    // `not-a-spreadsheet` (wrong file) because the fix is different (re-upload
    // vs. this was never going to work).
    return { ok: false, reason: "parse-failed" }
  }
}
