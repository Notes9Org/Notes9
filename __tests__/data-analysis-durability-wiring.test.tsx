/**
 * The durability capabilities land in `lib/data-analysis/**` and are all
 * optional, so nothing throws when the workspace does not pass them — it just
 * quietly stops recording. That is the failure this file exists to catch: every
 * assertion here is about a value CROSSING the boundary out of
 * `data-analysis-workspace.tsx`, not about the library that receives it.
 *
 *  1. `rerunRevision` is handed the live conversation thread.
 *  2. `saveRevision` is handed the append-only audit log.
 *  3. `ProvenancePanel` gets `auditLog` + `author` + `savedAt`, not `history`.
 *  4. `RevisionHistoryDialog` gets working `onPin` and `onDuplicate`.
 *
 * The children are capturing stubs for the same reason the sibling suite stubs
 * `AnalysisConsole`: they belong to other slices and are tested there. What is
 * untested anywhere else is whether this file connects them.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as XLSX from "xlsx"
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest"

import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import type { AnalysisConsoleProps } from "@/components/data-analysis/workspace/analysis-console"
import type { DataFileRow } from "@/components/data-analysis/data-files-list"

const pushSpy = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: pushSpy, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock("@/components/spreadsheet/univer-workbook-view", () => ({
  UniverWorkbookView: () => <div data-testid="mock-univer" />,
}))
vi.mock("@/components/data-analysis/plotly-chart", () => ({
  PlotlyChart: () => <div data-testid="mock-chart" />,
}))
vi.mock("@/components/ui/sidebar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/sidebar")>()
  return { ...actual, useSidebar: () => ({ state: "collapsed", setOpen: vi.fn() }) }
})
vi.mock("@/components/auth/auth-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/auth/auth-provider")>()
  return { ...actual, useAuthUser: () => null }
})
vi.mock("@/lib/data-analysis/ai/analysis-thread-store", () => ({
  writeAnalysisIntent: vi.fn(async () => true),
  readAnalysisIntent: vi.fn(async () => null),
  createAnalysisThread: vi.fn(async () => null),
  appendAnalysisTurn: vi.fn(async () => {}),
  updateAnalysisTurnPlan: vi.fn(async () => {}),
  loadAnalysisThread: vi.fn(async () => []),
}))

const { revisionRow } = vi.hoisted(() => ({
  revisionRow: (overrides: Record<string, unknown> = {}) => ({
    id: "rev-1",
    analysisId: "saved-1",
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
    isPinned: false,
    forkedFromRevisionId: null,
    authorId: "u1",
    createdAt: "2024-05-05T10:00:00.000Z",
    ...overrides,
  }),
}))

const { pinRevisionSpy, duplicateAnalysisSpy } = vi.hoisted(() => ({
  pinRevisionSpy: vi.fn(),
  duplicateAnalysisSpy: vi.fn(),
}))
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
    pinRevision: pinRevisionSpy,
    duplicateAnalysis: duplicateAnalysisSpy,
  }
})

const { saveRevisionSpy, rerunRevisionSpy } = vi.hoisted(() => ({
  saveRevisionSpy: vi.fn(),
  rerunRevisionSpy: vi.fn(),
}))
vi.mock("@/lib/data-analysis/workspace/saved-analysis-session", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data-analysis/workspace/saved-analysis-session")>()
  return {
    ...actual,
    saveRevision: saveRevisionSpy,
    rerunRevision: rerunRevisionSpy,
    autosaveDraft: vi.fn(async () => {}),
  }
})

type ProvenanceProps = React.ComponentProps<
  typeof import("@/components/data-analysis/workspace/provenance-panel").ProvenancePanel
>
const captured = vi.hoisted(() => ({
  provenance: null as unknown,
  history: null as unknown,
  console: null as unknown,
}))
vi.mock("@/components/data-analysis/workspace/provenance-panel", () => ({
  ProvenancePanel: (props: unknown) => {
    captured.provenance = props
    return null
  },
}))

type HistoryDialogProps = React.ComponentProps<
  typeof import("@/components/data-analysis/workspace/analysis-library").RevisionHistoryDialog
>
vi.mock("@/components/data-analysis/workspace/analysis-library", () => ({
  SaveAnalysisDialog: ({
    open,
    onSave,
  }: {
    open: boolean
    onSave: (input: {
      name: string
      experimentId: string | null
      changeSummary: string
    }) => void | Promise<void>
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => void onSave({ name: "Saved analysis", experimentId: null, changeSummary: "" })}
      >
        mock-confirm-save
      </button>
    ) : null,
  RevisionHistoryDialog: (props: unknown) => {
    captured.history = props
    return null
  },
}))

// Always mounted, unlike `ReopenBanner`, so the re-run path is reachable
// without first faking a whole reopen verdict. Only the trigger is stubbed;
// what it fires is the workspace's own `rerunIntoNewRevisionNow`.
vi.mock("@/components/data-analysis/workspace/reopen-banner", () => ({
  ReopenBanner: () => null,
  MovedExclusionsBanner: ({ onRerun }: { onRerun: () => void }) => (
    <button type="button" onClick={onRerun}>
      mock-rerun
    </button>
  ),
}))

vi.mock("@/components/data-analysis/workspace/analysis-console", () => ({
  AnalysisConsole: (props: AnalysisConsoleProps) => {
    captured.console = props
    return (
      <div data-testid="mock-console">
        {props.attachSlot}
        <button type="button" onClick={() => props.onSend("log the y axis")}>
          mock-send
        </button>
        {props.turns
          .filter((t) => t.role === "assistant" && t.plan)
          .map((t) => (
            <button key={t.id} type="button" onClick={() => props.onApprove(t.id)}>
              mock-approve
            </button>
          ))}
      </div>
    )
  },
}))

import { DataAnalysisWorkspace } from "@/components/data-analysis/data-analysis-workspace"
import { toStoredThread } from "@/lib/data-analysis/ai/analysis-thread"

const lastConsoleProps = () => captured.console as AnalysisConsoleProps | null
const lastProvenanceProps = () => captured.provenance as ProvenanceProps | null
const lastHistoryProps = () => captured.history as HistoryDialogProps | null

beforeAll(() => {
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

beforeEach(() => {
  // Set here, not in the `vi.hoisted` factories: `clearAllMocks` between tests
  // wipes call history, and re-stating the behaviour is cheaper than reasoning
  // about which reset verb keeps an implementation.
  saveRevisionSpy.mockImplementation(async ({ analysisId }: { analysisId: string }) =>
    revisionRow({ analysisId }),
  )
  rerunRevisionSpy.mockImplementation(async ({ analysisId }: { analysisId: string }) =>
    revisionRow({ id: "rev-2", analysisId, revisionNo: 2 }),
  )
  pinRevisionSpy.mockImplementation(async (revisionId: string, pinned: boolean) =>
    revisionRow({ id: revisionId, isPinned: pinned }),
  )
  duplicateAnalysisSpy.mockImplementation(async () => ({
    id: "saved-2",
    experimentId: null,
    projectId: null,
    name: "Saved analysis (copy)",
    draftSpec: {},
    sourceDataFileId: null,
    workspaceState: {},
    currentRevisionNo: 1,
    updatedAt: new Date().toISOString(),
  }))
})

afterEach(() => {
  cleanup()
  captured.console = null
  captured.provenance = null
  captured.history = null
  vi.clearAllMocks()
  vi.restoreAllMocks()
  localStorage.clear()
})

function file(overrides: Partial<DataFileRow> = {}): DataFileRow {
  return {
    id: "f1",
    file_name: "growth-curve.csv",
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
    const fileId = /\/data-files\/([^/]+)\/workbook/.exec(url)?.[1] ?? ""
    const entry = byFileId[fileId]
    if ((init?.method ?? "GET") === "GET") {
      return { json: async () => ({ workbook_snapshot: null }) } as Response
    }
    if (entry?.snapshot) return { json: async () => ({ workbook_snapshot: entry.snapshot }) } as Response
    return { json: async () => ({ error: "unreadable", reason: entry?.reason ?? "parse-failed" }) } as Response
  }) as typeof fetch
}

/**
 * Loads a dataset, gets one AI plan proposed and approved, and returns. The
 * approval is what puts a real entry in the append-only audit log — an
 * `auditLog: []` would pass a "was the prop passed" assertion while proving
 * nothing about the log actually reaching the write.
 */
async function loadedWithOneApprovedEdit() {
  const specAuthor = await import("@/lib/data-analysis/ai/spec-author-client")
  vi.spyOn(specAuthor, "requestSpecPatch").mockResolvedValue({
    outcome: "patch",
    rationale: "Logging the Y axis.",
    mutations: [{ kind: "figure.setTitle", value: "Test" } as never],
    clarificationNeeded: null,
    rejected: [],
  })

  mockWorkbookFetch({ f1: { snapshot: snapshot("growth-curve.csv") } })
  render(<DataAnalysisWorkspace files={[file()]} />)

  fireEvent.click(screen.getByRole("button", { name: /^library/i }))
  await screen.findByRole("dialog")
  fireEvent.click(screen.getByText("growth-curve.csv"))
  await waitFor(() => expect(lastConsoleProps()?.variant).toBe("rail"))

  fireEvent.click(screen.getByRole("button", { name: "mock-send" }))
  fireEvent.click(await screen.findByRole("button", { name: "mock-approve" }))
  await waitFor(() =>
    expect(lastConsoleProps()?.turns.some((t) => t.role === "assistant" && t.plan?.status === "approved")).toBe(true),
  )
}

/** Exact match: a second icon button ("Save to data files library") also starts with "Save". */
async function saveOnce() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  fireEvent.click(await screen.findByRole("button", { name: "mock-confirm-save" }))
  await waitFor(() => expect(saveRevisionSpy).toHaveBeenCalled())
}

describe("data-analysis durability wiring", () => {
  it("saves the audit log with the revision, and re-runs carry the live thread", async () => {
    // The re-run recomputes before it writes, and bails with a toast if the
    // engine refuses. Stubbed so the test exercises the write, not the engine.
    const engineClient = await import("@/lib/data-analysis/engine/client")
    vi.spyOn(engineClient, "computeAnalysis").mockResolvedValue({
      ok: true,
      result: { warnings: [] },
    } as never)

    await loadedWithOneApprovedEdit()
    await saveOnce()

    // (2) The append-only log reaches the write, with the approved edit in it.
    const saved = saveRevisionSpy.mock.calls[0][0] as { auditLog?: unknown[]; conversationThread?: unknown[] }
    expect(saved.auditLog).toBeDefined()
    expect(saved.auditLog!.length).toBeGreaterThan(0)
    expect(saved.auditLog![0]).toMatchObject({ reverted: false })

    // (1) The re-run's new revision carries this session's transcript, rather
    // than being cut with an empty one and relying on the database fallback.
    fireEvent.click(screen.getByRole("button", { name: "mock-rerun" }))
    await waitFor(() => expect(rerunRevisionSpy).toHaveBeenCalled())
    const rerun = rerunRevisionSpy.mock.calls[0][0] as { conversationThread?: unknown[] }
    expect(rerun.conversationThread).toEqual(toStoredThread(lastConsoleProps()!.turns))
    expect(rerun.conversationThread!.length).toBeGreaterThan(0)
  }, 20000)

  it("gives the provenance card the audit log and the revision's own author and timestamp", async () => {
    await loadedWithOneApprovedEdit()

    // The reverted-aware log, not the flattened `history` the card used to get.
    expect(lastProvenanceProps()?.history).toBeUndefined()
    expect(lastProvenanceProps()?.auditLog?.length).toBeGreaterThan(0)

    // Before a save there is no revision row, so no who/when is claimed.
    expect(lastProvenanceProps()?.author).toBeNull()
    expect(lastProvenanceProps()?.savedAt).toBeNull()

    await saveOnce()

    // (3) After the save both come off the revision row — the values that
    // survive a reload — not off React state.
    await waitFor(() => expect(lastProvenanceProps()?.author).toEqual({ id: "u1" }))
    expect(lastProvenanceProps()?.savedAt).toBe("2024-05-05T10:00:00.000Z")
    expect(lastProvenanceProps()?.revisionNo).toBe(1)
  }, 20000)

  it("surfaces pin and duplicate, and duplicating navigates instead of swapping the open analysis", async () => {
    await loadedWithOneApprovedEdit()
    await saveOnce()

    // (4) Both actions are handed to the dialog — without them it renders no
    // pin and no duplicate control at all.
    await waitFor(() => expect(lastHistoryProps()?.onPin).toBeTypeOf("function"))
    expect(lastHistoryProps()?.onDuplicate).toBeTypeOf("function")

    const rev = revisionRow() as unknown as Parameters<NonNullable<HistoryDialogProps["onPin"]>>[0]

    lastHistoryProps()!.onPin!(rev, true)
    await waitFor(() => expect(pinRevisionSpy).toHaveBeenCalledWith("rev-1", true))

    lastHistoryProps()!.onDuplicate!(rev)
    await waitFor(() => expect(duplicateAnalysisSpy).toHaveBeenCalledWith({ revisionId: "rev-1" }))
    // The copy is a different analysis, so the researcher is taken to it
    // explicitly rather than having the workspace rebound under them.
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/data-analysis?analysis=saved-2"))
  }, 20000)
})
