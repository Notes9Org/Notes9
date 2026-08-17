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
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
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
      // A real element, not undefined — otherwise the DOM-equality assertion
      // below is vacuous: two renders that both omit attachSlot are equal
      // whether or not the passthrough actually works.
      attachSlot: <button type="button">Attach file</button>,
    }

    const { container: consoleContainer } = render(<AnalysisConsole {...props} variant="empty" />)
    const { container: composerContainer } = render(<AnalysisComposer {...props} variant="empty" />)

    expect(consoleContainer.innerHTML).toBe(composerContainer.innerHTML)
    expect(screen.getAllByText("Start an analysis")).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "Attach file" })).toHaveLength(2)
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

  it("only the most recent proposed plan offers Approve", () => {
    // Both turns are (unrealistically) `proposed` at once — upstream is expected
    // to mark a superseded plan `stale` before this ever renders, but the
    // component must not depend on that alone: approving a stale plan against a
    // spec that has moved is the hazard this guards.
    //
    // Renamed from "counts every proposed plan but only offers Approve for the
    // most recent one": the "counts" half named a pending-plan-count UI (e.g.
    // "2 pending plans") that lived in ADR-019's collapsed `docked` bar. ADR-024
    // retired that bar entirely and no count display replaced it anywhere in
    // AnalysisConsole/AnalysisComposer — there is nothing left to assert. This
    // test now claims only the behaviour it actually checks.
    render(
      <AnalysisConsole
        {...baseProps({
          turns: [
            userTurn({ id: "u1" }),
            proposedTurn({ id: "a1" }),
            userTurn({ id: "u2" }),
            proposedTurn({ id: "a2" }),
          ],
        })}
      />,
    )

    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1)
  })

  it("clicking Approve with two proposed turns resolves to the latest turn id", () => {
    const onApprove = vi.fn()
    render(
      <AnalysisConsole
        {...baseProps({
          turns: [
            userTurn({ id: "u1" }),
            proposedTurn({ id: "a1" }),
            userTurn({ id: "u2" }),
            proposedTurn({ id: "a2" }),
          ],
          onApprove,
        })}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))

    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onApprove).toHaveBeenCalledWith("a2")
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

/**
 * jsdom does not move focus on its own when a Tab keydown is fired — that is
 * what @testing-library/user-event's `tab()` does internally, and it is not a
 * dependency of this repo. So this computes the DOM's real tabbable order
 * (same exclusion rules a browser applies: disabled, tabIndex -1, aria-hidden
 * or an aria-hidden ancestor) and steps through it with a real Tab keydown
 * fired on the currently-focused element before each `.focus()` call. A focus
 * trap or an aria-hidden ancestor wrapping Approve/Discard would make this
 * land on the wrong element (or throw), which a static `.tabIndex` read
 * cannot detect.
 */
function getTabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]'),
  ).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.tabIndex !== -1 &&
      el.getAttribute("aria-hidden") !== "true" &&
      !el.closest('[aria-hidden="true"]'),
  )
}

function pressTab(container: HTMLElement): HTMLElement {
  const from = document.activeElement as HTMLElement | null
  fireEvent.keyDown(from ?? document.body, { key: "Tab", code: "Tab" })
  const tabbables = getTabbables(container)
  const fromIndex = from ? tabbables.indexOf(from) : -1
  const next = tabbables[fromIndex + 1]
  if (!next) throw new Error("Tab ran off the end of the tabbable order")
  next.focus()
  return next
}

describe("AnalysisConsole — keyboard only", () => {
  it("real Tab navigation reaches Approve then Discard, and focus actually lands on each", () => {
    const { container } = render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />)

    const approve = screen.getByRole("button", { name: "Approve" })
    const discard = screen.getByRole("button", { name: "Discard" })

    // Nothing is focused yet, and the transcript renders before the composer,
    // so the first two Tab presses must land on Approve then Discard — before
    // ever reaching the message textarea below them.
    const first = pressTab(container)
    expect(first).toBe(approve)
    expect(document.activeElement).toBe(approve)

    const second = pressTab(container)
    expect(second).toBe(discard)
    expect(document.activeElement).toBe(discard)
  })
})

describe("AnalysisConsole — variant=rail: a long transcript scrolls in its own box, never the page", () => {
  // ADR-024 removes the old `max-h-[40vh]` bounded overlay entirely — the rail
  // that docks this component now owns the outer height (that dock is slice 05,
  // components/data-analysis/data-analysis-workspace.tsx, not yet built, so it
  // cannot be asserted from here). What this component still owns, and what
  // this test pins: the transcript's own scroll container never grows past
  // its box (`overflow-y-auto`), and the flex chain around it can shrink
  // (`min-h-0`) instead of forcing the box to grow with content — the two
  // properties that make "scrolls internally" possible once a real height is
  // imposed from outside.
  it("the transcript scroll container is internally scrollable and can shrink to fit, regardless of turn count", () => {
    const manyTurns = Array.from({ length: 40 }, (_, i) => userTurn({ id: `u${i}`, content: `message ${i}` }))
    const { container } = render(<AnalysisConsole {...baseProps({ turns: manyTurns })} />)

    const scroller = container.querySelector('[data-testid="analysis-transcript-scroll"]')
    expect(scroller).not.toBeNull()
    expect(scroller?.className).toContain("overflow-y-auto")
    // The old bounded overlay is gone by design — never reintroduce it here.
    expect(scroller?.className).not.toContain("max-h-[40vh]")

    // The container the scroller lives in must be a shrinkable flex item, not
    // one that grows to fit its content and pushes the page.
    const scrollBox = scroller?.parentElement
    expect(scrollBox?.className).toContain("min-h-0")
    expect(scrollBox?.className).toContain("flex-1")
  })
})

describe("AnalysisConsole — variant=rail: busy", () => {
  it("shows a thinking state and withholds Send while a request is in flight, even with text typed", () => {
    render(<AnalysisConsole {...baseProps({ busy: true })} />)

    const textarea = screen.getByRole("textbox", { name: "Ask about this data" })
    fireEvent.change(textarea, { target: { value: "log the y axis" } })

    const send = screen.getByRole("button", { name: "Thinking…" })
    expect(send).toBeDisabled()
  })
})
