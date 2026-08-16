/**
 * Slice 01 (ADR-017) route contract: `POST
 * /api/experiments/{experimentId}/data-files/{fileId}/workbook` backfills a
 * snapshot by reading storage through the caller's own session (AC-2), and a
 * file that genuinely can't be opened stays listed and says why, via a
 * `422 { error: "unreadable", reason }` (AC-3). See
 * `lib/data-analysis/workbook-open.test.ts` for the reason-classification
 * unit tests this route delegates to.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}))

let currentUser: { id: string } | null = { id: "user-1" }
let mockClient: ReturnType<typeof makeSupabaseMock>["client"]

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockClient),
}))

type ExperimentDataRow = {
  id: string
  file_name: string | null
  file_url: string | null
  file_size?: number | null
  workbook_snapshot: unknown
  metadata: { storage_path?: string } | null
}

function makeSupabaseMock(opts: {
  row: ExperimentDataRow | null
  rowError?: { message: string } | null
  updateError?: { message: string } | null
  download?: () => Promise<{ data: Blob | null; error: unknown }>
}) {
  const updateSpy = vi.fn(async (_payload: Record<string, unknown>) => ({ error: opts.updateError ?? null }))
  const downloadSpy = vi.fn(opts.download ?? (async () => ({ data: null, error: { message: "not found" } })))

  const client = {
    from: (table: string) => {
      if (table === "experiment_data") {
        return {
          select: (_cols: string) => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, _v2: string) => ({
                maybeSingle: async () => ({ data: opts.row, error: opts.rowError ?? null }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, _v2: string) => updateSpy(payload),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: (_bucket: string) => ({ download: downloadSpy }),
    },
  }
  return { client, updateSpy, downloadSpy }
}

function makeRequest(): Request {
  return {} as Request
}

function paramsFor(experimentId: string, fileId: string) {
  return { params: Promise.resolve({ experimentId, fileId }) }
}

function csvBytes(): ArrayBuffer {
  return new TextEncoder().encode("name,score\nAlice,10\nBob,20\n").buffer as ArrayBuffer
}

function truncatedZipBytes(): ArrayBuffer {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer
}

/** `buildSpreadsheetWorkbookSnapshot` mints a fresh random workbook/sheet id
 *  on every parse, by design, so two independent parses of the same bytes
 *  are never *literally* identical objects -- "identical content" means the
 *  actual cell data converges, not the opaque generated ids around it. */
function cellContent(snapshot: unknown): unknown {
  const sheets = (snapshot as { sheets: Record<string, { cellData: unknown }> }).sheets
  return Object.values(sheets).map((sheet) => sheet.cellData)
}

beforeEach(() => {
  currentUser = { id: "user-1" }
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("POST /api/experiments/{experimentId}/data-files/{fileId}/workbook", () => {
  it("401s when there is no session", async () => {
    currentUser = null
    const { client } = makeSupabaseMock({ row: null })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(401)
  })

  it("404s when the row doesn't exist (or RLS hides it)", async () => {
    const { client } = makeSupabaseMock({ row: null })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as { status: number }
    expect(res.status).toBe(404)
  })

  it("short-circuits on an already-cached snapshot without touching storage (idempotent backfill race)", async () => {
    const { client, downloadSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        file_url: null,
        workbook_snapshot: { sheets: {} },
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/data.csv" },
      },
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, cached: true })
    expect(downloadSpy).not.toHaveBeenCalled()
  })

  it("AC-2: reads a never-parsed file's bytes from storage through the caller's own session and returns it", async () => {
    const { client, downloadSpy, updateSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        file_url: null,
        workbook_snapshot: null,
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/data.csv" },
      },
      download: async () => ({ data: new Blob([csvBytes()]), error: null }),
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.tabular_format).toBe("csv")
    expect(body.workbook_snapshot).toBeTruthy()
    expect(downloadSpy).toHaveBeenCalledWith("org-1/experiment/exp-1/file-1/data.csv")
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const [payload] = updateSpy.mock.calls[0] as [Record<string, unknown>]
    expect(payload.tabular_format).toBe("csv")
    expect(payload.workbook_snapshot).toBeTruthy()
  })

  it("edge case 7 (version skew): POST success payload matches the pre-slice shape { ok, snapshot_updated_at, tabular_format }, with snapshot_updated_at populated", async () => {
    // Old clients only ever read these three keys; `workbook_snapshot` below
    // is additive, never a replacement (ARCHITECTURE.md "Version skew: old
    // client, new route" -- "the success body is unchanged").
    const { client } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        file_url: null,
        workbook_snapshot: null,
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/data.csv" },
      },
      download: async () => ({ data: new Blob([csvBytes()]), error: null }),
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.snapshot_updated_at).toBe("string")
    expect(body.snapshot_updated_at).toBeTruthy()
    expect(body.tabular_format).toBe("csv")
  })

  it("edge case 5: two concurrent first-time backfills converge on an idempotent write (last writer wins with identical content)", async () => {
    const { client, downloadSpy, updateSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        file_url: null,
        workbook_snapshot: null,
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/data.csv" },
      },
      download: async () => ({ data: new Blob([csvBytes()]), error: null }),
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const [resA, resB] = (await Promise.all([
      POST(makeRequest(), paramsFor("exp-1", "file-1")),
      POST(makeRequest(), paramsFor("exp-1", "file-1")),
    ])) as unknown as Array<{ status: number; json: () => Promise<Record<string, unknown>> }>

    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()])
    expect(bodyA.ok).toBe(true)
    expect(bodyB.ok).toBe(true)
    // Both callers independently downloaded and parsed the same bytes; the
    // write each makes is idempotent -- last writer wins with identical
    // content, not a partial or conflicting one. (Cell content, not the
    // whole snapshot object, is the right equality: each parse mints its own
    // random workbook/sheet id by design -- see `cellContent`.)
    expect(cellContent(bodyA.workbook_snapshot)).toEqual(cellContent(bodyB.workbook_snapshot))
    expect(bodyA.tabular_format).toBe(bodyB.tabular_format)
    expect(downloadSpy).toHaveBeenCalledTimes(2)
    expect(updateSpy).toHaveBeenCalledTimes(2)
    const [payloadA] = updateSpy.mock.calls[0] as [Record<string, unknown>]
    const [payloadB] = updateSpy.mock.calls[1] as [Record<string, unknown>]
    expect(cellContent(payloadA.workbook_snapshot)).toEqual(cellContent(payloadB.workbook_snapshot))
    expect(payloadA.tabular_format).toBe(payloadB.tabular_format)
  })

  it("AC-2: falls back to file_url for a pre-migration row with no metadata.storage_path", async () => {
    const fetchSpy = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe("https://project.supabase.co/storage/v1/object/sign/user/legacy.csv")
      return new Response(csvBytes(), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchSpy)

    const { client, downloadSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "legacy.csv",
        file_url: "https://project.supabase.co/storage/v1/object/sign/user/legacy.csv",
        workbook_snapshot: null,
        metadata: null,
      },
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(downloadSpy).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("never fails the open when the snapshot cache write fails (bytes still come back)", async () => {
    const { client, updateSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        file_url: null,
        workbook_snapshot: null,
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/data.csv" },
      },
      download: async () => ({ data: new Blob([csvBytes()]), error: null }),
      updateError: { message: "connection reset" },
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.workbook_snapshot).toBeTruthy()
    expect(body.snapshot_updated_at).toBeNull()
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it("AC-3 reason=forbidden: row visible cross-org, storage denies the download through the caller's own RLS-scoped session", async () => {
    // No `profiles` org lookup: `forbidden` is derived from the actual
    // storage denial (the real, RLS-gated `download()` call), not guessed
    // from an org-prefix heuristic -- see route.ts. A storage path came from
    // the row itself, so any failure to read it is classified `forbidden`,
    // never the weaker `no-bytes` (ARCHITECTURE.md byte-resolution order).
    const { client, downloadSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        file_url: null,
        workbook_snapshot: null,
        metadata: { storage_path: "org-owner/experiment/exp-1/file-1/data.csv" },
      },
      download: async () => ({ data: null, error: { message: "not found" } }),
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "unreadable", reason: "forbidden" })
    expect(downloadSpy).toHaveBeenCalledTimes(1)
  })

  it("AC-3 reason=forbidden: a storage-path download denial never falls back to a legacy file_url", async () => {
    const fetchSpy = vi.fn(async () => new Response(csvBytes(), { status: 200 }))
    vi.stubGlobal("fetch", fetchSpy)
    const { client, downloadSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        // A legacy file_url is present too, to prove a storage-path denial
        // doesn't fall through to it: the fallback fires only when there is
        // no storage path at all.
        file_url: "https://project.supabase.co/storage/v1/object/sign/user/legacy.csv",
        workbook_snapshot: null,
        metadata: { storage_path: "org-owner/experiment/exp-1/file-1/data.csv" },
      },
      download: async () => ({ data: null, error: { message: "not found" } }),
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "unreadable", reason: "forbidden" })
    expect(downloadSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("AC-3 reason=too-large: a known oversized row skips downloading altogether", async () => {
    const { client, downloadSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "huge.xlsx",
        file_url: null,
        file_size: 25 * 1024 * 1024 + 1,
        workbook_snapshot: null,
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/huge.xlsx" },
      },
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "unreadable", reason: "too-large" })
    expect(downloadSpy).not.toHaveBeenCalled()
  })

  it("AC-3 reason=not-a-spreadsheet: a non-tabular extension the picker now shows (e.g. a PDF)", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.4\n%%EOF").buffer
    const { client } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "report.pdf",
        file_url: null,
        workbook_snapshot: null,
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/report.pdf" },
      },
      download: async () => ({ data: new Blob([pdfBytes]), error: null }),
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "unreadable", reason: "not-a-spreadsheet" })
  })

  it("AC-3 reason=parse-failed: a corrupt/truncated xlsx", async () => {
    const { client } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "broken.xlsx",
        file_url: null,
        workbook_snapshot: null,
        metadata: { storage_path: "org-1/experiment/exp-1/file-1/broken.xlsx" },
      },
      download: async () => ({ data: new Blob([truncatedZipBytes()]), error: null }),
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "unreadable", reason: "parse-failed" })
  })

  it("AC-3 reason=no-bytes: no storage path and no usable legacy file_url", async () => {
    const { client, downloadSpy } = makeSupabaseMock({
      row: {
        id: "file-1",
        file_name: "data.csv",
        file_url: null,
        workbook_snapshot: null,
        metadata: null,
      },
    })
    mockClient = client
    const { POST } = await import("@/app/api/experiments/[experimentId]/data-files/[fileId]/workbook/route")
    const res = (await POST(makeRequest(), paramsFor("exp-1", "file-1"))) as unknown as {
      status: number
      json: () => Promise<Record<string, unknown>>
    }
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "unreadable", reason: "no-bytes" })
    expect(downloadSpy).not.toHaveBeenCalled()
  })
})
