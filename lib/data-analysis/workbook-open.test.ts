/**
 * Slice 01 (ADR-017) unit tests for the storage-path → bytes →
 * parsed-workbook decision tree, isolated from Next.js routing and the real
 * Supabase client. Covers AC-2 (a never-parsed file opens by reading storage
 * with the caller's own session) and the reason taxonomy behind AC-3 (a file
 * that genuinely cannot open stays explainable: not-a-spreadsheet /
 * parse-failed / forbidden / no-bytes / too-large).
 */
import { describe, it, expect, vi } from "vitest"
import {
  MAX_WORKBOOK_BYTES,
  openWorkbookFromStorage,
  type WorkbookStorageDownloader,
} from "@/lib/data-analysis/workbook-open"

function csvBytes(): ArrayBuffer {
  return new TextEncoder().encode("name,score\nAlice,10\nBob,20\n").buffer as ArrayBuffer
}

function tsvBytes(): ArrayBuffer {
  return new TextEncoder().encode("name\tscore\nAlice\t10\nBob\t20\n").buffer as ArrayBuffer
}

/** ZIP local-file-header magic bytes, truncated — SheetJS recognises the
 *  container as a ZIP (so it's plausibly an xlsx) but fails to read it,
 *  which is the "corrupt/truncated xlsx" case (`parse-failed`), distinct
 *  from bytes that never looked like a spreadsheet at all. */
function truncatedZipBytes(): ArrayBuffer {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer
}

function downloaderReturning(data: Blob | null, error: unknown = null): WorkbookStorageDownloader {
  return { download: vi.fn(async () => ({ data, error })) }
}

const alwaysSafe = () => true
const neverSafe = () => false

describe("openWorkbookFromStorage", () => {
  it("AC-2: reads a never-parsed file's bytes from storage and parses it", async () => {
    const download = vi.fn(async (path: string) => {
      expect(path).toBe("org-1/experiment/exp-1/file-1/data.csv")
      return { data: new Blob([csvBytes()]), error: null }
    })
    const result = await openWorkbookFromStorage({
      fileName: "data.csv",
      storagePath: "org-1/experiment/exp-1/file-1/data.csv",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: neverSafe, // legacy fetch must never be reached when storage succeeds
      storage: { download },
    })
    expect(download).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tabularFormat).toBe("csv")
      expect(result.snapshot.sheets).toBeTruthy()
    }
  })

  it("parses a .tsv even though inferTabularFormatFromFileName excludes it (read-only, not the write-arming gate)", async () => {
    const result = await openWorkbookFromStorage({
      fileName: "data.tsv",
      storagePath: "org-1/experiment/exp-1/file-1/data.tsv",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: neverSafe,
      storage: downloaderReturning(new Blob([tsvBytes()])),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // tabular_format stays null for tsv on purpose — see spreadsheet-workbook.ts.
      expect(result.tabularFormat).toBeNull()
    }
  })

  it("falls back to legacyFileUrl only when there is no storage path at all (pre-migration rows)", async () => {
    const download = vi.fn()
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://project.supabase.co/storage/v1/object/public/user/legacy.csv")
      return new Response(csvBytes(), { status: 200 })
    })
    const result = await openWorkbookFromStorage({
      fileName: "legacy.csv",
      storagePath: null,
      legacyFileUrl: "https://project.supabase.co/storage/v1/object/public/user/legacy.csv",
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: { download },
      fetchImpl,
    })
    expect(download).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it("never attempts the legacy fetch when isSafeStorageUrl rejects it (SSRF allowlist still applies)", async () => {
    const fetchImpl = vi.fn(async () => new Response(csvBytes(), { status: 200 }))
    const result = await openWorkbookFromStorage({
      fileName: "legacy.csv",
      storagePath: null,
      legacyFileUrl: "https://evil.example/legacy.csv",
      forbidden: false,
      isSafeStorageUrl: neverSafe,
      storage: downloaderReturning(null),
      fetchImpl,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: "no-bytes" })
  })

  it("AC-3 reason=forbidden: short-circuits before any download when the caller flags cross-org access", async () => {
    const download = vi.fn()
    const result = await openWorkbookFromStorage({
      fileName: "data.csv",
      storagePath: "other-org/experiment/exp-1/file-1/data.csv",
      legacyFileUrl: null,
      forbidden: true,
      isSafeStorageUrl: alwaysSafe,
      storage: { download },
    })
    expect(download).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: "forbidden" })
  })

  it("same-org (forbidden=false): a storage download failure is no-bytes, and never falls back to legacyFileUrl even when one is present", async () => {
    // Distinguishes the two reasons a storage-path download can fail: this
    // one is the caller's own org (forbidden pre-check said so), so a
    // missing/broken object here is an ordinary `no-bytes`, not an
    // authorization matter -- and it still doesn't get a second chance via
    // the legacy URL fallback, which fires only when there is no storage
    // path at all.
    const download = vi.fn(async () => ({ data: null, error: { message: "object not found" } }))
    const fetchImpl = vi.fn(async () => new Response(csvBytes(), { status: 200 }))
    const result = await openWorkbookFromStorage({
      fileName: "data.csv",
      storagePath: "org-1/experiment/exp-1/file-1/data.csv",
      legacyFileUrl: "https://project.supabase.co/storage/v1/object/public/user/legacy.csv",
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: { download },
      fetchImpl,
    })
    expect(download).toHaveBeenCalledTimes(1)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: "no-bytes" })
  })

  it("AC-3 reason=no-bytes: no storage path, no file name at all", async () => {
    const result = await openWorkbookFromStorage({
      fileName: null,
      storagePath: null,
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(null),
    })
    expect(result).toEqual({ ok: false, reason: "no-bytes" })
  })

  it("AC-3 reason=no-bytes: no storage path and no usable legacy file_url", async () => {
    const result = await openWorkbookFromStorage({
      fileName: "data.csv",
      storagePath: null,
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(null),
    })
    expect(result).toEqual({ ok: false, reason: "no-bytes" })
  })

  it("AC-3 reason=too-large: known row size over the bound skips the download entirely", async () => {
    const download = vi.fn()
    const result = await openWorkbookFromStorage({
      fileName: "huge.xlsx",
      storagePath: "org-1/experiment/exp-1/file-1/huge.xlsx",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: { download },
      knownSizeBytes: MAX_WORKBOOK_BYTES + 1,
    })
    expect(download).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: "too-large" })
  })

  it("AC-3 reason=too-large: downloaded bytes over the bound, even without a known row size", async () => {
    const oversized = new Uint8Array(MAX_WORKBOOK_BYTES + 1)
    const result = await openWorkbookFromStorage({
      fileName: "huge.csv",
      storagePath: "org-1/experiment/exp-1/file-1/huge.csv",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(new Blob([oversized])),
    })
    expect(result).toEqual({ ok: false, reason: "too-large" })
  })

  it("AC-3 reason=not-a-spreadsheet: a non-tabular extension is rejected without ever parsing it", async () => {
    // A PDF's bytes would otherwise "succeed" through SheetJS's permissive
    // plain-text fallback parser (which doesn't throw on arbitrary bytes) and
    // silently become a garbage one-column sheet, which is the bug this gate exists to stop.
    const pdfBytes = new TextEncoder().encode("%PDF-1.4\n%%EOF").buffer
    const result = await openWorkbookFromStorage({
      fileName: "report.pdf",
      storagePath: "org-1/experiment/exp-1/file-1/report.pdf",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(new Blob([pdfBytes])),
    })
    expect(result).toEqual({ ok: false, reason: "not-a-spreadsheet" })
  })

  it("T0.2: a .txt export opens instead of being rejected as not-a-spreadsheet", async () => {
    // Every upload control in the workspace advertises accept=".txt", so a
    // rejection here made the app give two answers about one file. Tab-separated
    // because that is what a plate reader writes.
    const txt = new TextEncoder().encode("well\tsignal\nA1\t0.412\nA2\t0.518\n").buffer
    const result = await openWorkbookFromStorage({
      fileName: "plate-run.txt",
      storagePath: "org-1/experiment/exp-1/file-1/plate-run.txt",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(new Blob([txt])),
    })
    expect(result.ok).toBe(true)
  })

  it("T0.2: the sniffed delimiter reaches the parse, so columns are real columns", async () => {
    // The point of the sniff. If the separator were guessed wrong, this would
    // come back as ONE column holding the whole line as text.
    const txt = new TextEncoder().encode("well\tsignal\nA1\t0.412\n").buffer
    const result = await openWorkbookFromStorage({
      fileName: "plate-run.txt",
      storagePath: "org-1/experiment/exp-1/file-1/plate-run.txt",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(new Blob([txt])),
    })
    if (!result.ok) throw new Error(`expected an open, got ${result.reason}`)
    const snapshot = result.snapshot as {
      sheetOrder: string[]
      sheets: Record<string, { cellData: Record<number, Record<number, { v?: unknown }>> }>
    }
    const cells = snapshot.sheets[snapshot.sheetOrder[0]].cellData
    expect(cells[0][0].v).toBe("well")
    expect(cells[0][1].v).toBe("signal")
    expect(cells[1][0].v).toBe("A1")
    expect(cells[1][1].v).toBe(0.412)
  })

  it("T0.2: a .txt whose bytes are not tabular still opens as one column, not an error", async () => {
    // No delimiter found is a real answer, not a failure: prose in a .txt is a
    // single-column sheet, which is exactly what the user will see.
    const txt = new TextEncoder().encode("alpha\nbeta\ngamma\n").buffer
    const result = await openWorkbookFromStorage({
      fileName: "notes.txt",
      storagePath: "org-1/experiment/exp-1/file-1/notes.txt",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(new Blob([txt])),
    })
    expect(result.ok).toBe(true)
  })

  it("AC-3 reason=parse-failed: a tabular extension whose bytes are corrupt/truncated", async () => {
    const result = await openWorkbookFromStorage({
      fileName: "broken.xlsx",
      storagePath: "org-1/experiment/exp-1/file-1/broken.xlsx",
      legacyFileUrl: null,
      forbidden: false,
      isSafeStorageUrl: alwaysSafe,
      storage: downloaderReturning(new Blob([truncatedZipBytes()])),
    })
    expect(result).toEqual({ ok: false, reason: "parse-failed" })
  })
})
