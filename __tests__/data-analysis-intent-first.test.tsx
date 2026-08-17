/**
 * ADR-026: a reply belongs to the analysis that asked, not whatever tab
 * happens to be mounted when it resolves.
 *
 * Mirrors `__tests__/data-analysis-library-and-close.test.tsx`'s harness
 * (same heavy-dependency stubs, same `AnalysisConsole` capturing double) but
 * owns its own module mocks so it can control exactly when a spec-author
 * request resolves and what thread id it mints — the two knobs these tests
 * need that the sibling file's fixed mocks don't expose.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as XLSX from "xlsx"

import type { DataFileRow } from "@/components/data-analysis/data-files-list"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import type { AnalysisConsoleProps } from "@/components/data-analysis/workspace/analysis-console"

// ── Heavy / out-of-scope dependencies, stubbed (same as the sibling file) ──
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

// Only what this slice's tests need to control: which thread id a send
// mints, and asserting which thread id a turn was persisted under.
vi.mock("@/lib/data-analysis/ai/analysis-thread-store", () => ({
  createAnalysisThread: vi.fn(async () => null),
  appendAnalysisTurn: vi.fn(async () => {}),
  loadAnalysisThread: vi.fn(async () => []),
  updateAnalysisTurnPlan: vi.fn(async () => {}),
}))

let lastConsoleProps: AnalysisConsoleProps | null = null
vi.mock("@/components/data-analysis/workspace/analysis-console", () => ({
  AnalysisConsole: (props: AnalysisConsoleProps) => {
    lastConsoleProps = props
    return (
      <div data-testid="mock-console" data-variant={props.variant}>
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
  window.ResizeObserver = MockResizeObserver
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  lastConsoleProps = null
  vi.restoreAllMocks()
  // Shared jsdom localStorage: clear the persisted session so the next test
  // starts from a real empty analysis (see the sibling file's own note).
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

/** A real, parseable workbook snapshot so `specTable.rows.length > 0`
 * downstream and `askForChange`'s guard doesn't block sending. */
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

/** A real, parseable `.xlsx` `File` — for exercising `onImport`, which reads
 * `file.arrayBuffer()` itself rather than going through `mockWorkbookFetch`. */
function xlsxFile(fileName: string): File {
  const ws = XLSX.utils.aoa_to_sheet([
    ["x", "y"],
    [7, 8],
    [9, 10],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer
  return new File([buf], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

const validPatchOutcome = {
  outcome: "patch" as const,
  rationale: "Logging the Y axis.",
  mutations: [{ kind: "figure.setTitle", value: "Test" } as never],
  clarificationNeeded: null,
  rejected: [],
}

describe("data-analysis intent-first (ADR-026)", () => {
  // ── AC-6: a reply belongs to the analysis that asked ──────────────────────
  it("routes a reply to the analysis that asked it, not whatever tab is mounted when it resolves", async () => {
    const loaded = file({ id: "f1", file_name: "growth-curve.csv" })
    mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })

    const store = await import("@/lib/data-analysis/ai/analysis-thread-store")
    vi.mocked(store.createAnalysisThread).mockResolvedValue("thread-A")

    const specAuthor = await import("@/lib/data-analysis/ai/spec-author-client")
    let resolveSpecPatch: ((v: Awaited<ReturnType<typeof specAuthor.requestSpecPatch>>) => void) | null = null
    vi.spyOn(specAuthor, "requestSpecPatch").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSpecPatch = resolve
        }),
    )

    render(<DataAnalysisWorkspace files={[loaded]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("growth-curve.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    // Ask on analysis A.
    fireEvent.click(screen.getByRole("button", { name: "mock-send" }))
    await waitFor(() => expect(lastConsoleProps?.busy).toBe(true))
    const turnsOnAWhenAsked = lastConsoleProps!.turns.length

    // Switch to a second, unrelated analysis (B) before A's request resolves.
    fireEvent.click(screen.getByRole("button", { name: "New analysis" }))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("empty"))

    // B never asked anything — it must not show A's "Thinking…", nor start
    // with any of A's turns.
    expect(lastConsoleProps?.busy).toBe(false)
    expect(lastConsoleProps?.turns.length).toBe(0)

    // A's request resolves now, with B still the mounted tab.
    resolveSpecPatch!(validPatchOutcome)
    await waitFor(() =>
      expect(store.appendAnalysisTurn).toHaveBeenCalledWith(
        "thread-A",
        expect.objectContaining({ role: "assistant" }),
      ),
    )

    // Still on B: the reply did not land, and land, here.
    expect(lastConsoleProps?.variant).toBe("empty")
    expect(lastConsoleProps?.busy).toBe(false)
    expect(lastConsoleProps?.turns.length).toBe(0)

    // Switch back to A: the reply is there, appended to A's own transcript.
    fireEvent.click(screen.getAllByRole("tab")[0])
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))
    expect(lastConsoleProps?.turns.length).toBeGreaterThan(turnsOnAWhenAsked)
    expect(lastConsoleProps?.turns.find((t) => t.role === "assistant")).toBeDefined()
    // And it was persisted under A's own thread id, not left unpersisted or
    // written under whatever thread B might one day have.
    expect(store.appendAnalysisTurn).toHaveBeenCalledWith("thread-A", expect.objectContaining({ role: "assistant" }))
  })

  // ── AC-7 (partial): threadId never outlives its turns ─────────────────────
  it("a load path that clears the transcript also clears the thread handle", async () => {
    const fileA = file({ id: "fA", file_name: "tab-a.csv" })
    mockWorkbookFetch({ fA: { snapshot: snapshot("tab-a.csv") } })

    const store = await import("@/lib/data-analysis/ai/analysis-thread-store")
    vi.mocked(store.createAnalysisThread).mockResolvedValueOnce("thread-1").mockResolvedValueOnce("thread-2")

    const specAuthor = await import("@/lib/data-analysis/ai/spec-author-client")
    vi.spyOn(specAuthor, "requestSpecPatch").mockResolvedValue(validPatchOutcome)

    const { container } = render(<DataAnalysisWorkspace files={[fileA]} />)
    await openLibrary()
    fireEvent.click(screen.getByText("tab-a.csv"))
    await waitFor(() => expect(lastConsoleProps?.variant).toBe("docked"))

    // First question mints and persists under "thread-1".
    fireEvent.click(screen.getByRole("button", { name: "mock-send" }))
    await waitFor(() =>
      expect(store.appendAnalysisTurn).toHaveBeenCalledWith(
        "thread-1",
        expect.objectContaining({ role: "assistant" }),
      ),
    )

    // Importing a new file into this same tab (the always-present hidden
    // file input, not the "From your data files" dialog, so this exercises
    // `onImport`'s own call into `loadSnapshot`) clears the transcript...
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [xlsxFile("tab-a-replacement.xlsx")] } })
    await waitFor(() => expect(lastConsoleProps?.turns.length).toBe(0))

    // ...and must also clear the thread handle: the next question mints a
    // NEW thread ("thread-2") rather than silently appending into the file
    // that was just replaced. If the handle survived, `createAnalysisThread`
    // would never be called again and this would persist under "thread-1".
    fireEvent.click(screen.getByRole("button", { name: "mock-send" }))
    await waitFor(() =>
      expect(store.appendAnalysisTurn).toHaveBeenCalledWith(
        "thread-2",
        expect.objectContaining({ role: "assistant" }),
      ),
    )
  })
})
