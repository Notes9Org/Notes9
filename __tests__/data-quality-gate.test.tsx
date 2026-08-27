import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DataQualityGate } from "@/components/data-analysis/workspace/data-quality-gate"
import type { Finding, ReceiptLine } from "@/lib/data-analysis/workspace/data-quality"

afterEach(cleanup)

const outlier: Finding = {
  id: "grubbs:signal:row-3",
  severity: "decision",
  column: "signal",
  summary: 'One value in "signal" is a statistical outlier',
  evidence: "Grubbs G=2.913, p=0.0121, alpha=0.05, n=12",
  locations: [{ rowId: "row-3", column: "signal", value: 99.5 }],
  actions: [
    {
      label: "Exclude it (records the method)",
      mutations: [
        {
          kind: "data.excludeRow",
          exclusion: {
            rowId: "row-3",
            reasonKind: "statistical-outlier",
            reasonText: null,
            method: { name: "Grubbs", params: { alpha: 0.05 } },
            excludedBy: "tester",
            excludedAt: "2026-08-22T00:00:00.000Z",
          },
        },
      ],
    },
    { label: "Keep it", mutations: [] },
  ],
  recommended: null,
}

const applied: ReceiptLine[] = [
  { text: '"signal" read as numeric (2 values treated as missing)', origin: "auto", undo: null },
]

function renderGate(overrides: { applied?: ReceiptLine[]; decisions?: Finding[] } = {}) {
  const props = {
    open: true,
    fileName: "plate.csv",
    applied,
    decisions: [outlier],
    onChoose: vi.fn(),
    onUndo: vi.fn(),
    onContinue: vi.fn(),
    onOpenProvenance: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<DataQualityGate {...props} />) }
}

function focusablesIn(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
}

describe("DataQualityGate focus management", () => {
  it("moves focus into the dialog when it opens", () => {
    renderGate()
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
  })

  it("restores focus to the previously focused element on close", () => {
    const opener = document.createElement("button")
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const { unmount } = renderGate()
    expect(document.activeElement).not.toBe(opener)

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it("wraps Tab from the last focusable back to the first", () => {
    renderGate()
    const dialog = screen.getByRole("dialog")
    const focusable = focusablesIn(dialog)
    expect(focusable.length).toBeGreaterThan(1)

    const last = focusable[focusable.length - 1]
    last.focus()
    fireEvent.keyDown(dialog, { key: "Tab" })
    expect(document.activeElement).toBe(focusable[0])
  })

  it("wraps Shift+Tab from the dialog container back to the last focusable", () => {
    renderGate()
    const dialog = screen.getByRole("dialog")
    const focusable = focusablesIn(dialog)
    expect(document.activeElement).toBe(dialog)

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(focusable[focusable.length - 1])
  })

  it("leaves focus alone for keys other than Tab", () => {
    renderGate()
    const dialog = screen.getByRole("dialog")
    fireEvent.keyDown(dialog, { key: "Escape" })
    // Deliberately not dismissible: answering the findings is the exit.
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(document.activeElement).toBe(dialog)
  })
})

describe("DataQualityGate provenance opener", () => {
  it("renders the opener alongside automatic repairs and calls it", () => {
    const { props } = renderGate()
    fireEvent.click(screen.getByRole("button", { name: /see how this was derived/i }))
    expect(props.onOpenProvenance).toHaveBeenCalledTimes(1)
  })

  it("does not render the opener when nothing was applied automatically", () => {
    renderGate({ applied: [] })
    expect(screen.queryByRole("button", { name: /see how this was derived/i })).toBeNull()
  })
})

describe("DataQualityGate decision reversal", () => {
  it("reports no previous action on the first answer", () => {
    const { props } = renderGate()
    fireEvent.click(screen.getByRole("button", { name: /exclude it/i }))
    expect(props.onChoose).toHaveBeenCalledTimes(1)
    expect(props.onChoose.mock.calls[0][3]).toBeNull()
  })

  it("reports the replaced action when the researcher changes their mind", () => {
    const { props } = renderGate()
    fireEvent.click(screen.getByRole("button", { name: /exclude it/i }))
    fireEvent.click(screen.getByRole("button", { name: /^keep it$/i }))

    expect(props.onChoose).toHaveBeenCalledTimes(2)
    const previousAction = props.onChoose.mock.calls[1][3] as { label: string } | null
    expect(previousAction).not.toBeNull()
    expect(previousAction?.label).toMatch(/exclude it/i)
  })

  it("reports no previous action when the same choice is re-clicked", () => {
    const { props } = renderGate()
    fireEvent.click(screen.getByRole("button", { name: /exclude it/i }))
    fireEvent.click(screen.getByRole("button", { name: /exclude it/i }))
    expect(props.onChoose.mock.calls[1][3]).toBeNull()
  })
})
