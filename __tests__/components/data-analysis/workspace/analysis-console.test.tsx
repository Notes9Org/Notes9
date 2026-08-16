/**
 * `<AnalysisConsole>` — ADR-024.
 *
 * The claim under test: the conversation is no longer a collapsible overlay
 * that can hide a pending plan (ADR-019's `docked` variant — collapsed bar,
 * `max-h-[40vh]` overlay, expand/collapse animation — is retired). `rail` is
 * the working state: full-height transcript + composer, always rendered, so
 * a pending plan can never be hidden behind a collapsed bar because there is
 * no collapsed bar to hide it behind. `variant="empty"` is untouched
 * (ADR-015 already got that right).
 *
 * ADR-023's three-state gate — `canSend` decided by `gate.canCapture` alone
 * (a pre-data intent turn is legitimate even while `gate.canPropose` is
 * false), and `gate.reason` rendered verbatim, never replaced by a hardcoded
 * literal — is exercised end-to-end in `analysis-console-ux.test.tsx`; not
 * re-asserted here to avoid duplicating that coverage.
 *
 * This does not re-test `canApprovePlan` / `approvalBlockedReason` (owned by
 * `analysis-thread.ts`, imported here, not redefined). It tests that
 * `AnalysisConsole` wires them correctly in the rail layout.
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import { AnalysisConsole, type AnalysisConsoleProps } from "@/components/data-analysis/workspace/analysis-console"
import { AnalysisComposer } from "@/components/data-analysis/workspace/analysis-composer"
import {
  ANALYSIS_TURN_VERSION,
  type AnalysisAssistantTurn,
  type AnalysisUserTurn,
} from "@/lib/data-analysis/ai/analysis-thread"
import type { AiGate } from "@/lib/data-analysis/workspace/ai-gate"

afterEach(() => cleanup())

const SPEC_HASH = "sha256:current"

const OPEN_GATE: AiGate = { canCapture: true, canPropose: true, reason: null }

function userTurn(overrides: Partial<AnalysisUserTurn> = {}): AnalysisUserTurn {
  return {
    v: ANALYSIS_TURN_VERSION,
    id: "u1",
    role: "user",
    content: "log the y axis",
    dataFileId: null,
    specHash: SPEC_HASH,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function proposedTurn(overrides: Partial<AnalysisAssistantTurn> = {}): AnalysisAssistantTurn {
  return {
    v: ANALYSIS_TURN_VERSION,
    id: "a1",
    role: "assistant",
    content: "Here is what I would change:",
    plan: {
      steps: ["Log the Y axis"],
      mutations: [{ kind: "figure.setGridlines", value: true }],
      rejected: [],
      clarificationNeeded: null,
      status: "proposed",
    },
    specHashAtProposal: SPEC_HASH,
    createdAt: "2024-01-01T00:00:01.000Z",
    ...overrides,
  }
}

function baseProps(overrides: Partial<AnalysisConsoleProps> = {}): AnalysisConsoleProps {
  return {
    turns: [],
    currentSpecHash: SPEC_HASH,
    busy: false,
    gate: OPEN_GATE,
    onSend: vi.fn(),
    onApprove: vi.fn(),
    onDiscard: vi.fn(),
    datasetName: "plate.xlsx",
    variant: "rail",
    ...overrides,
  }
}

describe("AnalysisConsole — variant=empty", () => {
  it("is unchanged from AnalysisComposer's existing empty state", () => {
    const blockedGate: AiGate = { canCapture: false, canPropose: false, reason: "Attach a data file to start" }
    const props = {
      turns: [],
      currentSpecHash: SPEC_HASH,
      busy: false,
      gate: blockedGate,
      onSend: vi.fn(),
      onApprove: vi.fn(),
      onDiscard: vi.fn(),
      datasetName: null,
    }

    const { container: consoleContainer } = render(<AnalysisConsole {...props} variant="empty" />)
    const { container: composerContainer } = render(<AnalysisComposer {...props} variant="empty" />)

    expect(consoleContainer.innerHTML).toBe(composerContainer.innerHTML)
    expect(screen.getAllByText("Start an analysis")).toHaveLength(2)
  })
})

describe("AnalysisConsole — variant=rail: a pending plan can never be hidden (there is no collapsed state to hide it behind)", () => {
  it("renders the transcript and the pending plan directly — nothing to expand, nothing to miss", () => {
    render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />)

    expect(screen.getByText("log the y axis")).toBeInTheDocument()
    expect(screen.getByText("Here is what I would change:")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
  })

  it("clicking Approve approves the right turn", () => {
    const onApprove = vi.fn()
    render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn({ id: "a-latest" })], onApprove })} />)

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onApprove).toHaveBeenCalledWith("a-latest")
  })

  it("stale plan (spec moved on): names why Approve is withheld, never a silently disabled button", () => {
    render(
      <AnalysisConsole
        {...baseProps({
          turns: [userTurn(), proposedTurn({ specHashAtProposal: "sha256:stale" })],
          currentSpecHash: SPEC_HASH,
        })}
      />,
    )

    // Never a silently disabled button — no Approve at all, and the reason why is on screen.
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(screen.getByText(/analysis changed after this was proposed/i)).toBeInTheDocument()
  })
})

describe("AnalysisConsole — a reply arriving must not steal focus mid-edit", () => {
  it("renders the reply but leaves focus exactly where it was", () => {
    const { rerender } = render(
      <div>
        <input aria-label="a sheet cell" />
        <AnalysisConsole {...baseProps({ turns: [userTurn()] })} />
      </div>,
    )

    const sheetCell = screen.getByLabelText("a sheet cell")
    sheetCell.focus()
    expect(document.activeElement).toBe(sheetCell)

    rerender(
      <div>
        <input aria-label="a sheet cell" />
        <AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />
      </div>,
    )

    // The reply landed...
    expect(screen.getByText("Here is what I would change:")).toBeInTheDocument()
    // ...but focus never moved off the sheet cell.
    expect(document.activeElement).toBe(sheetCell)
  })
})

describe("AnalysisConsole — keyboard only", () => {
  it("Approve and Discard are real, focusable buttons — in tab order", () => {
    render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />)

    const transcript = screen.getByText("Here is what I would change:").closest("div")
    expect(transcript).not.toBeNull()
    const approve = within(transcript as HTMLElement).getByRole("button", { name: "Approve" })
    const discard = within(transcript as HTMLElement).getByRole("button", { name: "Discard" })
    expect(approve.tabIndex).not.toBe(-1)
    expect(discard.tabIndex).not.toBe(-1)
  })
})
