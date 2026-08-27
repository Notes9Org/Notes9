/**
 * Slice 02 (console-ux) — `<AnalysisConsole>` / `<AnalysisComposer>`.
 *
 * Covers the brief's "Done when" list plus the four failure-mode edge cases
 * this slice owns (Volume/historyDropped, Cost-latency/stuck-Thinking,
 * Partial failure/double-approve, Partial failure/stale-spec), and the
 * console's contribution to AC-2 (a pre-data question turn is visible and
 * intent may be sent before data exists) and AC-7 (a swapped-in turns array —
 * standing in for a tab switch or reload delivering a persisted conversation —
 * renders every turn, including a still-pending plan, with nothing dropped).
 *
 * `AiGate` (`lib/data-analysis/workspace/ai-gate.ts`) is owned by slice 01 and
 * lands in the same wave; this file constructs gate fixtures against the
 * documented shape (`{ canCapture, canPropose, reason }`) rather than
 * importing an implementation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { AnalysisConsole } from "@/components/data-analysis/workspace/analysis-console"
import { AnalysisComposer } from "@/components/data-analysis/workspace/analysis-composer"
import type {
  AnalysisAssistantTurn,
  AnalysisPlan,
  AnalysisTurn,
  AnalysisUserTurn,
} from "@/lib/data-analysis/ai/analysis-thread"
import type { AiGate } from "@/lib/data-analysis/workspace/ai-gate"

const SPEC_HASH = "sha256:current"

function gate(overrides: Partial<AiGate> = {}): AiGate {
  return { canCapture: true, canPropose: true, reason: null, ...overrides }
}

function userTurn(overrides: Partial<AnalysisUserTurn> = {}): AnalysisUserTurn {
  return {
    v: 1,
    id: "u1",
    role: "user",
    content: "hello",
    dataFileId: null,
    specHash: SPEC_HASH,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function plan(overrides: Partial<AnalysisPlan> = {}): AnalysisPlan {
  return {
    steps: ["Plot Y vs X"],
    mutations: [{ kind: "figure.setTitle", value: "Y vs X" } as unknown as AnalysisPlan["mutations"][number]],
    rejected: [],
    clarificationNeeded: null,
    status: "proposed",
    ...overrides,
  }
}

function assistantTurn(overrides: Partial<AnalysisAssistantTurn> = {}): AnalysisAssistantTurn {
  return {
    v: 1,
    id: "a1",
    role: "assistant",
    content: "Here is a plan.",
    plan: plan(),
    specHashAtProposal: SPEC_HASH,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function baseConsoleProps(overrides: Record<string, unknown> = {}) {
  return {
    turns: [] as AnalysisTurn[],
    currentSpecHash: SPEC_HASH,
    busy: false,
    gate: gate(),
    onSend: vi.fn(),
    onApprove: vi.fn(),
    onDiscard: vi.fn(),
    datasetName: "sample.csv",
    variant: "rail" as const,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

describe("AnalysisComposer — gate-derived reason (never a literal)", () => {
  it("renders gate.reason verbatim when send is refused, not a hardcoded string", () => {
    const reason = "Import or type some data, then ask."
    render(
      <AnalysisComposer
        turns={[]}
        currentSpecHash={SPEC_HASH}
        busy={false}
        gate={gate({ canCapture: false, canPropose: false, reason })}
        onSend={vi.fn()}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        datasetName={null}
        variant="empty"
      />,
    )
    // The reason is shown verbatim as the placeholder — never the retired
    // literal "Attach a data file to start" (ADR-015's lying-gate failure).
    expect(screen.getByRole("textbox", { name: "Ask about this data" })).toHaveAttribute(
      "placeholder",
      reason,
    )
    expect(screen.queryByText("Attach a data file to start")).not.toBeInTheDocument()
  })

  it("shows a different gate.reason verbatim — proves the text is derived, not authored here", () => {
    const reason = "The workbook has no numeric columns to plot yet."
    render(
      <AnalysisComposer
        turns={[]}
        currentSpecHash={SPEC_HASH}
        busy={false}
        gate={gate({ canCapture: true, canPropose: false, reason })}
        onSend={vi.fn()}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        datasetName="sample.csv"
        variant="rail"
      />,
    )
    expect(screen.getByText(reason)).toBeInTheDocument()
  })
})

describe("AnalysisComposer — ADR-023 three-state gate", () => {
  it("allows send when canCapture is true and canPropose is false (pre-data intent)", () => {
    const onSend = vi.fn()
    render(
      <AnalysisComposer
        turns={[]}
        currentSpecHash={SPEC_HASH}
        busy={false}
        gate={gate({ canCapture: true, canPropose: false, reason: "No dataset yet." })}
        onSend={onSend}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        datasetName={null}
        variant="empty"
      />,
    )
    const textarea = screen.getByRole("textbox", { name: "Ask about this data" })
    fireEvent.change(textarea, { target: { value: "I want to compare control vs treatment" } })
    const button = screen.getByRole("button", { name: "Ask" })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(onSend).toHaveBeenCalledWith("I want to compare control vs treatment")
  })

  it("blocks send when canCapture is false, even if canPropose is somehow true", () => {
    const onSend = vi.fn()
    render(
      <AnalysisComposer
        turns={[]}
        currentSpecHash={SPEC_HASH}
        busy={false}
        gate={gate({ canCapture: false, canPropose: true, reason: "No analysis mounted." })}
        onSend={onSend}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        datasetName={null}
        variant="empty"
      />,
    )
    const textarea = screen.getByRole("textbox", { name: "Ask about this data" })
    fireEvent.change(textarea, { target: { value: "anything" } })
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled()
  })
})

describe("AnalysisComposer — textarea Enter/Shift+Enter", () => {
  it("Enter sends the prompt and clears the box", () => {
    const onSend = vi.fn()
    render(
      <AnalysisComposer
        turns={[]}
        currentSpecHash={SPEC_HASH}
        busy={false}
        gate={gate()}
        onSend={onSend}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        datasetName="sample.csv"
        variant="rail"
      />,
    )
    const textarea = screen.getByRole("textbox", { name: "Ask about this data" }) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "log the Y axis" } })
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false })
    expect(onSend).toHaveBeenCalledWith("log the Y axis")
    expect(textarea.value).toBe("")
  })

  it("Shift+Enter does not send", () => {
    const onSend = vi.fn()
    render(
      <AnalysisComposer
        turns={[]}
        currentSpecHash={SPEC_HASH}
        busy={false}
        gate={gate()}
        onSend={onSend}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        datasetName="sample.csv"
        variant="rail"
      />,
    )
    const textarea = screen.getByRole("textbox", { name: "Ask about this data" }) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "line one" } })
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea.value).toBe("line one")
  })
})

describe("AnalysisConsole — variant=\"rail\" has no ADR-019 overlay geometry", () => {
  it("renders no max-h-[40vh] cap and no absolute inset-x-0 bottom-full overlay", () => {
    const { container } = render(
      <AnalysisConsole {...baseConsoleProps({ turns: [userTurn(), assistantTurn()] })} />,
    )
    const html = container.innerHTML
    expect(html).not.toContain("max-h-[40vh]")
    expect(html).not.toContain("bottom-full")
    expect(container.querySelector('[class*="absolute inset-x-0 bottom-full"]')).toBeNull()
  })
})

describe("AnalysisConsole — a pending plan is never hidden", () => {
  it("keeps a proposed plan's Approve button visible and reachable", () => {
    render(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [userTurn(), assistantTurn({ plan: plan({ status: "proposed" }) })],
        })}
      />,
    )
    const approve = screen.getByRole("button", { name: "Approve" })
    expect(approve).toBeVisible()
    expect(approve).not.toBeDisabled()
  })
})

describe("Edge case — Volume: historyDropped is surfaced, not silent", () => {
  it("shows the dropped-turn count when a response carries historyDropped", () => {
    render(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [userTurn(), assistantTurn({ historyDropped: 4, plan: null })],
        })}
      />,
    )
    expect(screen.getByText(/4 dropped/)).toBeInTheDocument()
  })
})

describe("Edge case — Cost/latency: a timeout outcome re-enables the composer", () => {
  it("does not leave the composer stuck on \"Thinking…\" after busy clears", () => {
    const onSend = vi.fn()
    const { rerender } = render(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [userTurn()],
          busy: true,
          onSend,
        })}
      />,
    )
    expect(screen.getByRole("button", { name: "Thinking" })).toBeDisabled()

    // spec-author-client.ts returns an outcome, not an exception: busy clears,
    // an error turn is appended, and the plan never entered `proposed`.
    rerender(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [userTurn(), assistantTurn({ error: "Timed out after 45s.", plan: null })],
          busy: false,
          onSend,
        })}
      />,
    )
    const button = screen.getByRole("button", { name: "Ask" })
    const textarea = screen.getByRole("textbox", { name: "Ask about this data" })
    fireEvent.change(textarea, { target: { value: "try again" } })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(onSend).toHaveBeenCalledWith("try again")
  })
})

describe("Edge case — Partial failure: approve clicked twice is a no-op", () => {
  it("removes Approve once the plan is approved, so a second click cannot fire onApprove again", () => {
    const onApprove = vi.fn()
    const { rerender } = render(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [userTurn(), assistantTurn({ id: "a-latest" })],
          onApprove,
        })}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onApprove).toHaveBeenCalledWith("a-latest")

    // The parent settles the plan; canApprovePlan now returns false, so the
    // button is gone rather than merely disabled-and-clickable.
    rerender(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [userTurn(), assistantTurn({ id: "a-latest", plan: plan({ status: "approved" }) })],
          onApprove,
        })}
      />,
    )
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(screen.getByText("Applied.")).toBeInTheDocument()
    expect(onApprove).toHaveBeenCalledTimes(1)
  })
})

describe("Edge case — Partial failure: spec changed between propose and approve", () => {
  it("withholds Approve and states the reason instead of an enabled button", () => {
    render(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [userTurn(), assistantTurn({ specHashAtProposal: "sha256:stale" })],
          currentSpecHash: SPEC_HASH,
        })}
      />,
    )
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "The analysis changed after this was proposed, so it can no longer be applied. Ask again.",
      ),
    ).toBeInTheDocument()
  })
})

describe("AC-2 — a pre-data intent turn is a legitimate send and is visible", () => {
  it("shows the assistant's clarifying question, asked before any dataset exists", () => {
    render(
      <AnalysisConsole
        {...baseConsoleProps({
          turns: [
            userTurn({ content: "I want to compare two groups" }),
            assistantTurn({
              content: "Got it — once you attach data, which column separates the groups?",
              plan: null,
              specHashAtProposal: SPEC_HASH,
            }),
          ],
          gate: gate({ canCapture: true, canPropose: false, reason: "Import or type some data, then ask." }),
          datasetName: null,
        })}
      />,
    )
    expect(screen.getByText("I want to compare two groups")).toBeInTheDocument()
    expect(
      screen.getByText("Got it — once you attach data, which column separates the groups?"),
    ).toBeInTheDocument()
    // Send stays legitimate: canCapture is true even though canPropose is false.
    const textarea = screen.getByRole("textbox", { name: "Ask about this data" })
    fireEvent.change(textarea, { target: { value: "the treatment column" } })
    expect(screen.getByRole("button", { name: "Ask" })).not.toBeDisabled()
  })
})

describe("AC-7 — a swapped turns array (tab switch / reload) drops nothing", () => {
  it("renders every turn after the props are replaced wholesale, including a still-pending plan", () => {
    const { rerender } = render(<AnalysisConsole {...baseConsoleProps({ turns: [] })} />)

    // Stands in for a tab switch or a reload handing back the persisted
    // conversation as one fresh props snapshot (ADR-026: moves as one unit).
    const persisted: AnalysisTurn[] = [
      userTurn({ id: "u1", content: "first question" }),
      assistantTurn({ id: "a1", content: "first answer", plan: plan({ status: "approved" }) }),
      userTurn({ id: "u2", content: "second question" }),
      assistantTurn({ id: "a2", content: "second answer", plan: plan({ status: "proposed" }) }),
    ]
    rerender(<AnalysisConsole {...baseConsoleProps({ turns: persisted })} />)

    expect(screen.getByText("first question")).toBeInTheDocument()
    expect(screen.getByText("first answer")).toBeInTheDocument()
    expect(screen.getByText("second question")).toBeInTheDocument()
    expect(screen.getByText("second answer")).toBeInTheDocument()
    // The still-pending plan (a2) stays actionable after the swap.
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
    // The settled plan (a1) is honest about being done, not re-offered.
    expect(screen.getByText("Applied.")).toBeInTheDocument()
  })
})

describe("AnalysisConsole — pinned auto-scroll (hooks/use-pinned-auto-scroll)", () => {
  function stub(el: HTMLElement, opts: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: opts.scrollTop })
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: opts.scrollHeight })
    Object.defineProperty(el, "clientHeight", { configurable: true, value: opts.clientHeight })
  }

  async function flushRaf() {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
  }

  it("stays pinned to the bottom when a new turn lands while the user is at the bottom", async () => {
    const { rerender, container } = render(
      <AnalysisConsole {...baseConsoleProps({ turns: [userTurn({ id: "u1" })] })} />,
    )
    const el = within(container).getByTestId("analysis-transcript-scroll")
    stub(el, { scrollTop: 300, scrollHeight: 800, clientHeight: 500 })
    fireEvent.scroll(el) // at the bottom: 800 - 300 - 500 === 0

    stub(el, { scrollTop: 300, scrollHeight: 1200, clientHeight: 500 })
    rerender(
      <AnalysisConsole
        {...baseConsoleProps({ turns: [userTurn({ id: "u1" }), assistantTurn({ id: "a1" })] })}
      />,
    )
    await flushRaf()
    await waitFor(() => expect(el.scrollTop).toBe(1200))
  })

  it("does not yank a scrolled-up user down, and offers Jump to latest", async () => {
    const { rerender, container } = render(
      <AnalysisConsole {...baseConsoleProps({ turns: [userTurn({ id: "u1" })] })} />,
    )
    const el = within(container).getByTestId("analysis-transcript-scroll")
    stub(el, { scrollTop: 0, scrollHeight: 800, clientHeight: 500 })
    fireEvent.scroll(el) // far from the bottom: 800 - 0 - 500 === 300 > tolerance

    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument()

    rerender(
      <AnalysisConsole
        {...baseConsoleProps({ turns: [userTurn({ id: "u1" }), assistantTurn({ id: "a1" })] })}
      />,
    )
    await flushRaf()
    // Not pinned, so the new turn must not force the scroll position.
    expect(el.scrollTop).toBe(0)
    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument()
  })
})
