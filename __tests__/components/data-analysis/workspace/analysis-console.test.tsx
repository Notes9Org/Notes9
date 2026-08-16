/**
 * `<AnalysisConsole>` — ADR-019.
 *
 * The claim under test: the conversation stops permanently occupying the top
 * third of the analysis pane. `variant="empty"` is untouched (ADR-015 already
 * got that right); `variant="docked"` rests as a single ~44px bar and only
 * grows upward, as an overlay, while someone is actually reading it — and a
 * pending plan is the one thing that is never allowed to disappear when it
 * collapses, because Approve is the whole feature.
 *
 * This does not re-test `motion.tsx`'s `Collapse` (not this slice's file) or
 * `canApprovePlan` / `approvalBlockedReason` (owned by `analysis-thread.ts`,
 * imported here, not redefined). It tests that `AnalysisConsole` wires them
 * correctly and honours the three layout rules from the architecture doc.
 */

import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, within, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { afterEach } from "vitest"

import { AnalysisConsole, type AnalysisConsoleProps } from "@/components/data-analysis/workspace/analysis-console"
import { AnalysisComposer } from "@/components/data-analysis/workspace/analysis-composer"
import {
  ANALYSIS_TURN_VERSION,
  type AnalysisAssistantTurn,
  type AnalysisUserTurn,
} from "@/lib/data-analysis/ai/analysis-thread"

// `useReducedMotion` (framer-motion) memoises its `matchMedia` read in a
// module-level ref the first time any `motion` component mounts, and jsdom
// does not implement `matchMedia` at all. Stubbing it here, before the first
// render in this file, makes every test in this file exercise the
// reduced-motion path. That memoisation also means this file cannot cheaply
// contrast against `prefers-reduced-motion: false` in the same process — the
// "reduced motion" describe block below is the one that asserts the actual
// claim ("no height animation, just a state change") directly, rather than
// leaving it implicit.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  })
})

afterEach(() => cleanup())

const SPEC_HASH = "sha256:current"

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
    blockedReason: null,
    onSend: vi.fn(),
    onApprove: vi.fn(),
    onDiscard: vi.fn(),
    datasetName: "plate.xlsx",
    variant: "docked",
    ...overrides,
  }
}

/** The bar's `max-h-[40vh]` overlay wrapper, rendered whenever there are turns. */
function transcriptWrapper(container: HTMLElement) {
  return container.querySelector('[class*="max-h-[40vh]"]')
}

describe("AnalysisConsole — variant=empty", () => {
  it("is unchanged from AnalysisComposer's existing empty state", () => {
    const props = {
      turns: [],
      currentSpecHash: SPEC_HASH,
      busy: false,
      blockedReason: "Attach a data file to start",
      onSend: vi.fn(),
      onApprove: vi.fn(),
      onDiscard: vi.fn(),
      datasetName: null,
      attachSlot: <button type="button">Attach file</button>,
    }

    const { container: consoleContainer } = render(
      <AnalysisConsole {...props} variant="empty" />,
    )
    const { container: composerContainer } = render(
      <AnalysisComposer {...props} variant="empty" />,
    )

    expect(consoleContainer.innerHTML).toBe(composerContainer.innerHTML)
    expect(screen.getAllByText("Start an analysis")).toHaveLength(2)
  })
})

describe("AnalysisConsole — variant=docked, collapsed is the resting state", () => {
  it("mounts collapsed even with existing history — a panel that stays open is the bug", () => {
    const { container } = render(
      <AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />,
    )

    // The transcript's OVERLAY wrapper exists (there are turns to show), but
    // its content is not mounted while collapsed — Collapse renders
    // `{open && children}`, so nothing inside it is in the DOM at rest.
    expect(transcriptWrapper(container)).not.toBeNull()
    expect(screen.queryByText("log the y axis")).not.toBeInTheDocument()
  })

  it("expands on send", () => {
    const onSend = vi.fn()
    render(<AnalysisConsole {...baseProps({ turns: [userTurn()], onSend })} />)

    expect(screen.queryByText("log the y axis")).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Ask about this data" }), {
      target: { value: "compare the groups" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ask" }))

    expect(onSend).toHaveBeenCalledWith("compare the groups")
    expect(screen.getByText("log the y axis")).toBeInTheDocument()
  })

  it("expands when a reply lands, keyed off turn identity so the same array never re-expands", () => {
    const { rerender } = render(<AnalysisConsole {...baseProps({ turns: [userTurn()] })} />)
    expect(screen.queryByText("log the y axis")).not.toBeInTheDocument()

    // Same array reference/content — must NOT force it open behind the
    // researcher's back if they already collapsed it.
    rerender(<AnalysisConsole {...baseProps({ turns: [userTurn()] })} />)
    expect(screen.queryByText("log the y axis")).not.toBeInTheDocument()

    // A genuinely new turn (new id) — this is "a reply lands".
    rerender(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />)
    expect(screen.getByText("Here is what I would change:")).toBeInTheDocument()
  })

  it("never reflows the content above it — the overlay wrapper is absolutely positioned, not in flow", () => {
    const { container } = render(
      <AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />,
    )
    const wrapper = transcriptWrapper(container)
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain("absolute")
    expect(wrapper?.className).toContain("bottom-full")
  })
})

describe("AnalysisConsole — a pending plan must never be hidden (the most important test in this slice)", () => {
  it("collapsed with a plan pending: the count is visible and Approve stays reachable", () => {
    render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />)

    // Collapsed — the transcript's own Approve button is not mounted.
    expect(screen.queryByText("log the y axis")).not.toBeInTheDocument()

    // But the collapsed bar itself carries the count and an Approve affordance.
    expect(screen.getByLabelText("1 pending plan")).toHaveTextContent("1")
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
  })

  it("clicking Approve from the collapsed bar approves the right turn", () => {
    const onApprove = vi.fn()
    render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn({ id: "a-latest" })], onApprove })} />)

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onApprove).toHaveBeenCalledWith("a-latest")
  })

  it("counts every proposed plan but only offers Approve for the most recent one", () => {
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
    expect(screen.getByLabelText("2 pending plans")).toHaveTextContent("2")
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1)
  })

  it("stale plan (spec moved on): the collapsed bar names why Approve is withheld, never a silently disabled button", () => {
    render(
      <AnalysisConsole
        {...baseProps({
          turns: [userTurn(), proposedTurn({ specHashAtProposal: "sha256:stale" })],
          currentSpecHash: SPEC_HASH,
        })}
      />,
    )

    // Still counted — a plan that becomes invisible is a plan that never gets applied.
    expect(screen.getByLabelText("1 pending plan")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(screen.getByText(/analysis changed after this was proposed/i)).toBeInTheDocument()
  })

  it("Escape collapses without discarding — the pending plan survives and stays reachable", async () => {
    const onDiscard = vi.fn()
    const { container } = render(
      <AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()], onDiscard })} />,
    )

    // Open it (send re-expands; here we use the explicit toggle instead).
    fireEvent.click(screen.getByRole("button", { name: "Expand the conversation" }))
    expect(screen.getByText("log the y axis")).toBeInTheDocument()

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Escape" })

    // Collapsed again immediately (the toggle button reflects it without waiting
    // on Collapse's exit animation).
    expect(screen.getByRole("button", { name: "Expand the conversation" })).toBeInTheDocument()
    expect(onDiscard).not.toHaveBeenCalled()

    // The transcript's own copy of the plan leaves the DOM once Collapse's exit
    // animation runs — once it does, the plan is still reachable: the collapsed
    // bar's Approve affordance took over.
    await waitFor(() => expect(screen.queryByText("log the y axis")).not.toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
  })
})

describe("AnalysisConsole — a reply arriving must not steal focus mid-edit", () => {
  it("expands but leaves focus exactly where it was", () => {
    const { rerender } = render(
      <div>
        <input aria-label="a sheet cell" />
        <AnalysisConsole {...baseProps({ turns: [userTurn()] })} />
      </div>,
    )

    const sheetCell = screen.getByLabelText("a sheet cell")
    sheetCell.focus()
    expect(document.activeElement).toBe(sheetCell)
    expect(screen.queryByText("Here is what I would change:")).not.toBeInTheDocument()

    // A reply actually lands — a new turn identity, the same mechanism that
    // drives "expands when a reply lands" above — while focus stays on the
    // sheet the whole time.
    rerender(
      <div>
        <input aria-label="a sheet cell" />
        <AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />
      </div>,
    )

    // The console did expand...
    expect(screen.getByText("Here is what I would change:")).toBeInTheDocument()
    // ...but focus never moved off the sheet cell.
    expect(document.activeElement).toBe(sheetCell)
  })
})

describe("AnalysisConsole — very long transcript scrolls internally, never grows the page", () => {
  it("bounds the overlay at 40vh with internal scrolling rather than pushing content", () => {
    const manyTurns = Array.from({ length: 40 }, (_, i) => userTurn({ id: `u${i}`, content: `turn ${i}` }))
    const { container } = render(<AnalysisConsole {...baseProps({ turns: manyTurns })} />)

    const wrapper = transcriptWrapper(container)
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain("max-h-[40vh]")
    expect(wrapper?.className).toContain("overflow-y-auto")
  })
})

describe("AnalysisConsole — reduced motion (this whole file runs under it, see beforeAll above)", () => {
  it("flips its own expanded/collapsed state — aria-expanded and content reachability — the instant it is toggled, never waiting on an animation frame", async () => {
    render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />)

    fireEvent.click(screen.getByRole("button", { name: "Expand the conversation" }))
    // No `waitFor` here: AnalysisConsole's own state — aria-expanded and the
    // transcript becoming reachable — is not gated on any animation
    // completing. That is "just a state change".
    const collapseToggle = screen.getByRole("button", { name: "Collapse the conversation" })
    expect(collapseToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("log the y axis")).toBeInTheDocument()

    fireEvent.click(collapseToggle)
    // The toggle itself flips immediately too, in the same synchronous tick —
    // collapsing is a state change, not something that waits on an exit
    // animation to finish.
    expect(screen.getByRole("button", { name: "Expand the conversation" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    // The one thing still awaited is the DOM removal of the now-exiting
    // transcript, which is gated on `AnimatePresence`'s exit animation —
    // `motion.tsx`'s contract (not owned by this slice, not re-tested here),
    // not this component's. `AnalysisConsole`'s own state already changed
    // above, before this resolves.
    await waitFor(() => expect(screen.queryByText("log the y axis")).not.toBeInTheDocument())
  })
})

describe("AnalysisConsole — keyboard only", () => {
  it("the expand/collapse toggle is reachable and announces its state via aria-expanded", () => {
    render(<AnalysisConsole {...baseProps({ turns: [userTurn()] })} />)
    const toggle = screen.getByRole("button", { name: "Expand the conversation" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(toggle)
    expect(screen.getByRole("button", { name: "Collapse the conversation" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })

  it("Approve and Discard are real, focusable buttons — in tab order — once the transcript is expanded", () => {
    render(<AnalysisConsole {...baseProps({ turns: [userTurn(), proposedTurn()] })} />)
    fireEvent.click(screen.getByRole("button", { name: "Expand the conversation" }))

    const transcript = screen.getByText("Here is what I would change:").closest("div")
    expect(transcript).not.toBeNull()
    const approve = within(transcript as HTMLElement).getByRole("button", { name: "Approve" })
    const discard = within(transcript as HTMLElement).getByRole("button", { name: "Discard" })
    expect(approve.tabIndex).not.toBe(-1)
    expect(discard.tabIndex).not.toBe(-1)
  })
})
