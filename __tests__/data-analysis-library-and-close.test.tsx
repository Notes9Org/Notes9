/**
 * Slice 03 (library-and-close): AC-1, AC-3, AC-4, AC-5, AC-6, AC-7.
 *
 * `DataAnalysisWorkspace` is a large client component (Univer sheet, Plotly
 * chart, the AI console, dock layout, sidebar context). This file mounts the
 * real component — proving the actual wiring the slice brief describes,
 * not a paraphrase of it — but replaces every dependency that is either
 * heavy (canvas/WebGL, portal-based context) or owned by another slice
 * (`AnalysisConsole`, slice 02) with a light test double. What is under
 * test is this slice's surgical targets: the library picker predicate, the
 * close paths (`closeDataset` / `closeAnalysis`), the unsaved-work confirm,
 * and the `AnalysisConsole` mount decision (`variant`) — not Univer, not
 * Plotly, not the console's own internals (those have their own tests).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as XLSX from "xlsx"

import type { DataFileRow } from "@/components/data-analysis/data-files-list"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { canApprovePlan } from "@/lib/data-analysis/ai/analysis-thread"
import type { AnalysisConsoleProps } from "@/components/data-analysis/workspace/analysis-console"

// ── Heavy / out-of-scope dependencies, stubbed ──────────────────────────────
// Univer creates a real canvas-backed workbook on mount; nothing this slice
// touches depends on its internals, so a stub keeps the test fast and honest
// about what it is (and is not) exercising.
vi.mock("@/components/spreadsheet/univer-workbook-view", () => ({
  UniverWorkbookView: () => <div data-testid="mock-sheet" />,
}))
vi.mock("@/components/data-analysis/plotly-chart", () => ({
  PlotlyChart: () => <div data-testid="mock-chart" />,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
vi.mock("@/components/ui/sidebar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/sidebar")>()
  return { ...actual, useSidebar: () => ({ state: "collapsed", setOpen: vi.fn() }) }
})
vi.mock("@/components/auth/auth-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/auth/auth-provider")>()
  return { ...actual, useAuthUser: () => null }
})
// The transcript-persistence path is fire-and-forget in the real component
// (it never throws), but it still reaches a Supabase client with no network
// in this environment; stub it so tests don't pay for that round trip.
vi.mock("@/lib/data-analysis/ai/analysis-thread-store", () => ({
  createAnalysisThread: vi.fn(async () => null),
  appendAnalysisTurn: vi.fn(async () => {}),
  updateAnalysisTurnPlan: vi.fn(async () => {}),
  loadAnalysisThread: vi.fn(async () => []),
}))
// The Save flow (§3A) reaches Supabase through these two modules; stubbed so
// `commitSave` resolves without a network round trip. Only what the AC-6
// per-tab regression test below actually calls is overridden — everything
// else is the real module.
vi.mock("@/lib/data-analysis/saved-analysis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data-analysis/saved-analysis")>()
  return {
    ...actual,
    createAnalysis: vi.fn(async (input: { name: string; experimentId: string | null }) => ({
      id: "saved-1",
      experimentId: input.experimentId,
      projectId: null,
      name: input.name,
      draftSpec: {},
      sourceDataFileId: null,
      workspaceState: {},
      currentRevisionNo: 0,
      updatedAt: new Date().toISOString(),
    })),
  }
})
vi.mock("@/lib/data-analysis/workspace/saved-analysis-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data-analysis/workspace/saved-analysis-session")>()
  return {
    ...actual,
    saveRevision: vi.fn(async ({ analysisId }: { analysisId: string }) => ({
      id: "rev-1",
      analysisId,
      revisionNo: 1,
      name: null,
      changeSummary: null,
      spec: {},
      specHash: "h",
      dataVersionHash: "d",
      dataSnapshot: null,
      results: null,
      engineVersion: "1",
      conversationThread: [],
      isFrozen: false,
      frozenAt: null,
      forkedFromRevisionId: null,
      authorId: "u1",
      createdAt: new Date().toISOString(),
    })),
    autosaveDraft: vi.fn(async () => {}),
  }
})
// Owned by another slice (§3A); stubbed the same way `AnalysisConsole` is
// below — a capturing/triggering double, not a re-test of its own internals.
vi.mock("@/components/data-analysis/workspace/analysis-library", () => ({
  SaveAnalysisDialog: ({
    open,
    onSave,
  }: {
    open: boolean
    onSave: (input: { name: string; experimentId: string | null; changeSummary: string }) => void | Promise<void>
  }) =>
    open ? (
      <button type="button" onClick={() => void onSave({ name: "Saved analysis", experimentId: null, changeSummary: "" })}>
        mock-confirm-save
      </button>
    ) : null,
  RevisionHistoryDialog: () => null,
}))

// `AnalysisConsole` is slice 02's component, already tested on its own
// (docked/collapsed/40vh/overlay). This slice's job is only the mount
// decision (`variant`, `datasetName`, the callbacks) — a capturing stub
// proves exactly that without re-testing slice 02's internals here.
let lastConsoleProps: AnalysisConsoleProps | null = null
vi.mock("@/components/data-analysis/workspace/analysis-console", () => ({
  AnalysisConsole: (props: AnalysisConsoleProps) => {
    lastConsoleProps = props
    return (
      <div data-testid="mock-console" data-variant={props.variant} data-dataset-name={props.datasetName ?? ""}>
        {props.attachSlot}
        <button type="button" onClick={() => props.onSend("log the y axis")}>
          mock-send
        </button>
      </div>
    )
  },
}))

import { DataAnalysisWorkspace } from "@/components/data-analysis/data-analysis-workspace"

beforeAll(() => {
  // jsdom implements neither; several children (framer-motion's
  // `useReducedMotion`, the responsive dock layout) read them on mount.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  })
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // jsdom has no ResizeObserver at runtime, but this TS/lib version already
  // declares the global type, so assigning the mock needs no type suppression.
  window.ResizeObserver = MockResizeObserver
  // jsdom has no layout engine, so it doesn't implement scrollIntoView either;
  // the tab strip calls it to keep the active tab in view.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  lastConsoleProps = null
  vi.restoreAllMocks()
  // The workspace persists its live session (workbook + config) to
  // `n9-data-analysis-session` in localStorage and restores it on the next
  // mount (see `data-analysis-workspace.tsx`'s `SESSION_KEY`). jsdom's
  // localStorage is shared across every test in this file, so a test that
  // loads a dataset leaves the next one restoring it straight into the
  // "docked" state instead of the empty one it rendered for — clear it here
  // so each test starts from a real empty analysis.
  localStorage.clear()
})

function file(overrides: Partial<DataFileRow> = {}): DataFileRow {
  return {
    id: "f1",
    file_name: "colleague-upload",
    file_type: null,
    file_size: 1024,
    data_type: null,
    created_at: "2024-01-01T00:00:00.000Z",
    experiment_id: "e1",
    project_id: "p1",
    file_url: "https://example.test/f1",
    tabular_format: null,
    experiment_name: "Experiment 1",
    project_name: "Project 1",
    ...overrides,
  }
}

/** A real, parseable workbook snapshot — built the same way the app itself
 * builds one from an `.xlsx`, so `specTable.rows.length > 0` downstream and
 * the AI composer's guard (`!derivedSpec || specTable.rows.length === 0`)
 * does not block `askForChange` in the AC-4 test. */
function snapshot(fileName: string) {
  const ws = XLSX.utils.aoa_to_sheet([
    ["x", "y"],
    [1, 2],
    [3, 4],
    [5, 6],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  return buildSpreadsheetWorkbookSnapshot(fileName, wb)
}

/** Models the workbook route's GET-then-POST-backfill flow the client drives
 * (ARCHITECTURE.md "open"): GET reports no cached snapshot, POST returns
 * either the parsed workbook or the `{ error: "unreadable", reason }` body. */
function mockWorkbookFetch(byFileId: Record<string, { snapshot?: unknown; reason?: string }>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const match = /\/data-files\/([^/]+)\/workbook/.exec(url)
    const fileId = match?.[1] ?? ""
    const entry = byFileId[fileId]
    const method = init?.method ?? "GET"
    if (method === "GET") {
      return { json: async () => ({ workbook_snapshot: null }) } as Response
    }
    // POST (backfill)
    if (entry?.snapshot) {
      return { json: async () => ({ workbook_snapshot: entry.snapshot }) } as Response
    }
    return {
      json: async () => ({ error: "unreadable", reason: entry?.reason ?? "parse-failed" }),
    } as Response
  }) as typeof fetch
}

async function openLibrary() {
  fireEvent.click(screen.getByRole("button", { name: /from your data files/i }))
  await screen.findByRole("dialog")
}

/**
 * A tab's own close control, e.g. "Close ELISA standard curve" (the tab title
 * comes from the rail's default chart title, not a literal "Analysis N") —
 * distinct from the always-present "Close dataset" button in the toolbar,
 * which also starts with "Close " and would otherwise collide with a plain
 * `/^Close /i` match.
 */
const CLOSE_TAB_NAME = /^Close (?!dataset$)/i

describe("data-analysis library and close (AC-1, AC-3, AC-4, AC-5, AC-6, AC-7)", () => {
  // ── AC-1: every row is listed, whatever its name ──────────────────────────
  it("lists a file that fails every extension / file_type heuristic", async () => {
    mockWorkbookFetch({})
    const oddFile = file({
      id: "odd1",
      file_name: "labnotes_final_v3", // no .csv/.xlsx/.tsv extension
      file_type: "application/octet-stream", // does not match /(spreadsheet|csv|excel)/i
      tabular_format: null,
    })
    render(<DataAnalysisWorkspace files={[oddFile]} />)
    await openLibrary()
    expect(screen.getByText("labnotes_final_v3")).toBeInTheDocument()
  })

  it("lists every row passed in, not just recognizably-tabular ones", async () => {
    mockWorkbookFetch({})
    const files = [
      file({ id: "a", file_name: "data.csv", tabular_format: "csv" }),
      file({ id: "b", file_name: "a_pdf_someone_uploaded", file_type: "application/pdf" }),
      file({ id: "c", file_name: "unparsed_upload", file_type: null }),
    ]
    render(<DataAnalysisWorkspace files={files} />)
    await openLibrary()
    for (const f of files) {
      expect(screen.getByText(f.file_name)).toBeInTheDocument()
    }
  })

  // ── AC-3: a file that cannot be opened stays listed with its reason ──────
  it.each([
    ["not-a-spreadsheet", "Not a spreadsheet"],
    ["parse-failed", "File is corrupt or unreadable"],
    ["forbidden", /shared with you, but the file itself is not/i],
    ["no-bytes", "Couldn't read this file's contents"],
    ["too-large", "File is too large to open (over 25MB)"],
  ] as const)("keeps the row listed and shows the '%s' reason inline", async (reason, label) => {
    const badFile = file({ id: "bad1", file_name: "broken.xlsx" })
    mockWorkbookFetch({ bad1: { reason } })
    render(<DataAnalysisWorkspace files={[badFile]} />)
    await openLibrary()

    fireEvent.click(screen.getByText("broken.xlsx"))

    await waitFor(() => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
    // Still listed, not vanished:
    expect(screen.getByText("broken.xlsx")).toBeInTheDocument()
    // And disabled — a failed row does not silently retry on the next click.
    expect(screen.getByText("broken.xlsx").closest("button")).toBeDisabled()
  })

  // ── AC-5: the last tab can be closed and the strip is never empty ────────
  it("closes the last analysis tab and leaves exactly one fresh empty tab", async () => {
    mockWorkbookFetch({})
    render(<DataAnalysisWorkspace files={[]} />)

    // The seeded tab's name comes from the rail's default chart title, not a
    // literal "Analysis 1" — match the "Close <tab>" pattern instead. Excludes
    // the always-present "Close dataset" toolbar button, which also starts
    // with "Close " and would otherwise make this match ambiguous.
    const closeButton = screen.getByRole("button", { name: CLOSE_TAB_NAME })
    fireEvent.click(closeButton)

    await waitFor(() => {
      // Still exactly one tab, and it is closeable again (never an empty strip).
      expect(screen.getAllByRole("button", { name: CLOSE_TAB_NAME })).toHaveLength(1)
    })
    // Empty-state variant confirms the fresh tab has no dataset — the reopened
    // tab is not a leftover reference to the one that was just closed.
    expect(lastConsoleProps?.variant).toBe("empty")
  })

  // ── AC-7: the workspace decides `docked` vs `empty`, nothing else does ───
  it("mounts the console `empty` with no data and `docked` once a file loads", async () => {
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })
    render(<DataAnalysisWorkspace files={[loaded]} />)

    expect(lastConsoleProps?.variant).toBe("empty")
    expect(lastConsoleProps?.datasetName).toBeNull()

    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))

    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))
    // `buildSpreadsheetWorkbookSnapshot` (pre-existing, out of this slice's
    // scope) strips the extension when it sets the snapshot's `name` — the
    // workspace's `sheetFileName` reads that field verbatim.
    expect(lastConsoleProps?.datasetName).toBe("growth-curve")
  })

  // ── AC-6: unsaved work is confirmed before it is discarded ────────────────
  it("confirms before closeDataset discards an unsaved, loaded dataset", async () => {
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })
    render(<DataAnalysisWorkspace files={[loaded]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    fireEvent.click(screen.getByRole("button", { name: "Close dataset" }))
    expect(await screen.findByText("Discard unsaved work?")).toBeInTheDocument()
    expect(screen.getByText(/discards the loaded dataset/i)).toBeInTheDocument()

    // "Keep working" cancels — the dataset is untouched.
    fireEvent.click(screen.getByRole("button", { name: "Keep working" }))
    await waitFor(() => expect(screen.queryByText("Discard unsaved work?")).not.toBeInTheDocument())
    expect(lastConsoleProps?.variant).toBe("docked")

    // Closing again and confirming actually discards it.
    fireEvent.click(screen.getByRole("button", { name: "Close dataset" }))
    fireEvent.click(await screen.findByRole("button", { name: "Discard and close" }))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("empty"))
  })

  it("does not confirm closing a brand-new tab with neither a dataset nor turns", async () => {
    mockWorkbookFetch({})
    render(<DataAnalysisWorkspace files={[]} />)

    fireEvent.click(screen.getByRole("button", { name: CLOSE_TAB_NAME }))
    expect(screen.queryByText("Discard unsaved work?")).not.toBeInTheDocument()
    // Allowed outright (AC-5), and the strip still isn't empty.
    expect(screen.getAllByRole("button", { name: CLOSE_TAB_NAME })).toHaveLength(1)
  })

  it("confirms before closeAnalysis discards turns left behind by a closed dataset", async () => {
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })
    const specAuthor = await import("@/lib/data-analysis/ai/spec-author-client")
    vi.spyOn(specAuthor, "requestSpecPatch").mockResolvedValue({
      outcome: "patch",
      rationale: "Logging the Y axis.",
      mutations: [{ kind: "figure.setTitle", value: "Test" } as never],
      clarificationNeeded: null,
      rejected: [],
    })

    render(<DataAnalysisWorkspace files={[loaded]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    fireEvent.click(screen.getByRole("button", { name: "mock-send" }))
    await waitFor(() => expect(lastConsoleProps?.turns.length).toBeGreaterThan(0))

    // closeDataset keeps the transcript (AC-4) — the tab now holds turns but
    // no dataset, which is still unsaved work `closeAnalysis` must confirm.
    fireEvent.click(screen.getByRole("button", { name: "Close dataset" }))
    fireEvent.click(await screen.findByRole("button", { name: "Discard and close" }))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("empty"))
    expect(lastConsoleProps?.turns.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: CLOSE_TAB_NAME }))
    expect(await screen.findByText("Discard unsaved work?")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Discard and close" }))
    await waitFor(() => {
      // The strip is never empty: the last tab closing leaves a fresh one.
      expect(screen.getAllByRole("button", { name: CLOSE_TAB_NAME })).toHaveLength(1)
    })
    expect(lastConsoleProps?.turns.length).toBe(0)
  })

  // ── AC-6 (defect a): the unsaved check is per-tab, not per-page ───────────
  it("still confirms closing a different, never-saved tab after another tab has been saved", async () => {
    const fileA = file({ id: "fA", file_name: "tab-a.csv" })
    const fileB = file({ id: "fB", file_name: "tab-b.csv" })
    mockWorkbookFetch({
      fA: { snapshot: snapshot("tab-a.csv") },
      fB: { snapshot: snapshot("tab-b.csv") },
    })

    render(<DataAnalysisWorkspace files={[fileA, fileB]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("tab-a.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    // A second tab, loaded with a different file, then saved.
    fireEvent.click(screen.getByRole("button", { name: "New analysis" }))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("empty"))
    await openLibrary()
    fireEvent.click(screen.getByText("tab-b.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    // Exact match: a second, unrelated icon button ("Save to data files
    // library") also starts with "Save" and would otherwise collide.
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "mock-confirm-save" }))
    await waitFor(() => expect(screen.queryByText("mock-confirm-save")).not.toBeInTheDocument())

    // Back to the first tab — its own dataset, never saved itself.
    fireEvent.click(screen.getAllByRole("tab")[0])
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))
    expect(lastConsoleProps?.datasetName).toBe("tab-a")

    // The page has saved something (tab b), but not THIS tab — closing it
    // must still ask, rather than reading the page-level "has anything ever
    // been saved" flag and discarding it silently.
    fireEvent.click(screen.getAllByRole("button", { name: CLOSE_TAB_NAME })[0])
    expect(await screen.findByText("Discard unsaved work?")).toBeInTheDocument()
  })

  // ── Edge case 6: closing a dataset mid-request aborts it ──────────────────
  it("closeDataset aborts an in-flight request, clears aiBusy, and drops a reply that resolves afterward", async () => {
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })
    const specAuthor = await import("@/lib/data-analysis/ai/spec-author-client")
    // Never settles on its own — only the `signal`'s abort event resolves it,
    // mirroring `spec-author-client.ts`'s own `catch (isAbort) -> { outcome:
    // "aborted" }`, so this proves the abort wiring, not a canned reply.
    vi.spyOn(specAuthor, "requestSpecPatch").mockImplementation(
      ({ signal }) =>
        new Promise((resolve) => {
          // requestSpecPatch's real signature has `signal` as optional, but the
          // production caller always passes one — assert it here rather than
          // widen the mock's type for a branch that never runs.
          signal!.addEventListener("abort", () => resolve({ outcome: "aborted" }))
        }),
    )

    render(<DataAnalysisWorkspace files={[loaded]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    fireEvent.click(screen.getByRole("button", { name: "mock-send" }))
    await waitFor(() => expect(lastConsoleProps?.busy).toBe(true))
    const turnsBeforeClose = lastConsoleProps!.turns.length

    // Close the dataset while the request is still in flight (unsaved: confirm first).
    fireEvent.click(screen.getByRole("button", { name: "Close dataset" }))
    fireEvent.click(await screen.findByRole("button", { name: "Discard and close" }))

    // Not stuck "Thinking…" forever.
    await waitFor(() => expect(lastConsoleProps?.busy).toBe(false))
    // The aborted reply never lands.
    expect(lastConsoleProps?.turns.length).toBe(turnsBeforeClose)
  })

  it("closeAnalysis aborts the closed tab's in-flight request so a late reply does not land on the neighbour", async () => {
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })
    const specAuthor = await import("@/lib/data-analysis/ai/spec-author-client")
    vi.spyOn(specAuthor, "requestSpecPatch").mockImplementation(
      ({ signal }) =>
        new Promise((resolve) => {
          // requestSpecPatch's real signature has `signal` as optional, but the
          // production caller always passes one — assert it here rather than
          // widen the mock's type for a branch that never runs.
          signal!.addEventListener("abort", () => resolve({ outcome: "aborted" }))
        }),
    )

    render(<DataAnalysisWorkspace files={[loaded]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    // A second, empty tab to act as the neighbour `closeAnalysis` switches to.
    fireEvent.click(screen.getByRole("button", { name: "New analysis" }))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("empty"))

    // Back to the first (loaded) tab and start a request there.
    fireEvent.click(screen.getAllByRole("tab")[0])
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))
    fireEvent.click(screen.getByRole("button", { name: "mock-send" }))
    await waitFor(() => expect(lastConsoleProps?.busy).toBe(true))

    // Close that tab (not just its dataset) while the request is in flight.
    fireEvent.click(screen.getAllByRole("button", { name: CLOSE_TAB_NAME })[0])
    fireEvent.click(await screen.findByRole("button", { name: "Discard and close" }))

    // Now on the neighbour: empty, not busy, and the aborted reply did not
    // land in its transcript either.
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("empty"))
    expect(lastConsoleProps?.busy).toBe(false)
    expect(lastConsoleProps?.turns.length).toBe(0)
  })

  // ── Edge case 1: the 500-row library ceiling ───────────────────────────────
  it("truncates the picker at 500 rows and says so, and filters client-side by name/experiment/project", async () => {
    mockWorkbookFetch({})
    const files = Array.from({ length: 510 }, (_, i) =>
      file({
        id: `f${i}`,
        file_name: `file-${i}.csv`,
        experiment_name: `Experiment ${i}`,
        project_name: `Project ${i}`,
      }),
    )
    // One findable-only-by-filter row past the raw 500-row slice, so the test
    // fails if truncation happens before filtering instead of after it.
    files.push(file({ id: "needle", file_name: "unique-needle.csv", experiment_name: "Exp X", project_name: "Proj X" }))

    render(<DataAnalysisWorkspace files={files} />)
    await openLibrary()

    expect(screen.getByText("file-0.csv")).toBeInTheDocument()
    expect(screen.getByText(/showing the first 500 files/i)).toBeInTheDocument()
    expect(screen.queryByText("unique-needle.csv")).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/search files/i), { target: { value: "unique-needle" } })
    expect(await screen.findByText("unique-needle.csv")).toBeInTheDocument()
    expect(screen.queryByText("file-0.csv")).not.toBeInTheDocument()
    // The truncation note is about the unfiltered list, not this narrowed one.
    expect(screen.queryByText(/showing the first 500 files/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/search files/i), { target: { value: "Experiment 7" } })
    expect(await screen.findByText("file-7.csv")).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/search files/i), { target: { value: "Project 12" } })
    expect(await screen.findByText("file-12.csv")).toBeInTheDocument()
  })

  // ── AC-4: closeDataset keeps the transcript but leaves no approvable plan ─
  it("closeDataset returns to empty, keeps the transcript, and leaves no approvable plan", async () => {
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })

    const specAuthor = await import("@/lib/data-analysis/ai/spec-author-client")
    vi.spyOn(specAuthor, "requestSpecPatch").mockResolvedValue({
      outcome: "patch",
      rationale: "Logging the Y axis.",
      mutations: [{ kind: "figure.setTitle", value: "Test" } as never],
      clarificationNeeded: null,
      rejected: [],
    })

    render(<DataAnalysisWorkspace files={[loaded]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    fireEvent.click(screen.getByRole("button", { name: "mock-send" }))

    await waitFor(() => {
      const turn = lastConsoleProps?.turns.find((t) => t.role === "assistant" && t.plan)
      expect(turn).toBeDefined()
    })
    const specHashBeforeClose = lastConsoleProps!.currentSpecHash
    const planTurn = lastConsoleProps!.turns.find((t) => t.role === "assistant" && t.plan)!
    // Sanity: the plan is approvable immediately after being proposed.
    expect(canApprovePlan(planTurn as never, specHashBeforeClose)).toBe(true)

    // closeDataset, via the confirm flow (unsaved dataset + turns).
    fireEvent.click(screen.getByRole("button", { name: "Close dataset" }))
    fireEvent.click(await screen.findByRole("button", { name: "Discard and close" }))

    await waitFor(() => expect(lastConsoleProps?.variant).toBe("empty"))
    // The transcript survives the close — this is not `closeAnalysis`.
    const keptTurn = lastConsoleProps!.turns.find((t) => t.id === planTurn.id)
    expect(keptTurn).toBeDefined()
    // But it is no longer approvable: the spec token moved when the dataset
    // was cleared, so `specHashAtProposal` no longer matches `currentSpecHash`.
    expect(canApprovePlan(keptTurn as never, lastConsoleProps!.currentSpecHash)).toBe(false)
  })
})

describe("data-analysis intent-first (ADR-025)", () => {
  // ── AC-1: loading data is not analysing it — the library-open load path ────
  it("loading a file from the library profiles it without seeding a chart, a statistical test, or a compute call", async () => {
    const engineClient = await import("@/lib/data-analysis/engine/client")
    const computeSpy = vi.spyOn(engineClient, "computeAnalysis")
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })
    render(<DataAnalysisWorkspace files={[loaded]} />)

    expect(lastConsoleProps?.variant).toBe("empty")

    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    // Profiled: the column-role guess is visible as a PipelineBar offer — a
    // suggestion with evidence, not applied state — and there is no
    // statistical-test offer yet, because no axes are chosen to test.
    expect(await screen.findByRole("button", { name: 'Apply: Plot "x" against "y"' })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Apply: Run /i })).not.toBeInTheDocument()

    // Give the compute effect's own 700ms debounce a full chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(computeSpy).not.toHaveBeenCalled()
  }, 10000)
})
