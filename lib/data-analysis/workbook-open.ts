/**
 * Slice 01 (ADR-017): "open a data file by its storage path, and stop
 * guessing which files are tabular". This is the storage-path → bytes →
 * parsed-workbook decision tree the workbook POST route runs, pulled out of
 * the route so it is unit-testable without mocking Next.js request/response
 * plumbing or a full Supabase client.
 *
 * Order mirrors ARCHITECTURE.md's Interfaces §1 pseudocode:
 *   1. `storagePath` (authenticated download, org-scoped RLS) is
 *      authoritative whenever present — it exists on every row written since
 *      the org-prefixed layout. A failed download here is classified
 *      `forbidden`, not `no-bytes`, and it is *not* a trigger for the legacy
 *      `file_url` fallback: Supabase Storage returns the same "not found"
 *      response for "RLS denied" and "genuinely missing", by design, so a
 *      denial can't be told apart from a missing object from the response
 *      alone — and treating that ambiguity as `no-bytes` is exactly the
 *      swallowed-authorization bug this module exists to avoid. A storage
 *      path came from the row itself, so a failure to read it is never a
 *      license to go around RLS via a URL instead.
 *   2. `legacyFileUrl` is attempted only when there is no storage path at
 *      all (pre-migration rows), and keeps its own SSRF allowlist
 *      (`isSafeStorageUrl`, still owned by the route since it depends on
 *      `NEXT_PUBLIC_SUPABASE_URL`).
 *   3. Anything left with no bytes, bytes too big to parse safely, an
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
  isSafeStorageUrl: (url: string) => boolean
  storage: WorkbookStorageDownloader
  fetchImpl?: (url: string) => Promise<Response>
  /** Known size (bytes) from the row, if any — lets an already-known-huge
   *  file skip the download entirely instead of paying for it just to reject it. */
  knownSizeBytes?: number | null
}

export async function openWorkbookFromStorage(input: OpenWorkbookFromStorageInput): Promise<WorkbookOpenResult> {
  const { fileName, storagePath, legacyFileUrl, isSafeStorageUrl, storage, fetchImpl = fetch, knownSizeBytes } = input

  if (typeof knownSizeBytes === "number" && knownSizeBytes > MAX_WORKBOOK_BYTES) {
    return { ok: false, reason: "too-large" }
  }
  if (!fileName) return { ok: false, reason: "no-bytes" }

  let bytes: ArrayBuffer | null = null

  if (storagePath) {
    const { data } = await storage.download(storagePath)
    if (!data) {
      // The row declares its own storage path, so a failed download here is
      // either an RLS denial (cross-org project member) or a genuinely
      // missing object -- Supabase Storage returns the same response for
      // both, by design, so both are classified `forbidden` rather than
      // guessed apart. This is *not* a `no-bytes` case, and it does not fall
      // through to the legacy `file_url` fetch below: that fallback exists
      // only for rows with no storage path at all.
      return { ok: false, reason: "forbidden" }
    }
    bytes = await data.arrayBuffer()
  } else if (legacyFileUrl && isSafeStorageUrl(legacyFileUrl)) {
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
