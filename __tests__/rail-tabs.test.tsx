import { useState } from "react"
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Dock, useDockLayout, type DockPanel } from "@/components/data-analysis/workspace/docks"

const STORAGE_KEY = "n9:rail-tabs-test"

function makePanels(overrides?: { askBadge?: number | null }): DockPanel[] {
  return [
    { id: "settings", label: "Chart settings", content: <div>Settings body</div> },
    {
      id: "ask",
      label: "Ask Notes9",
      badge: overrides?.askBadge,
      content: <div>Ask body</div>,
    },
  ]
}

function renderDock(props: Partial<React.ComponentProps<typeof Dock>> = {}) {
  const onToggle = vi.fn()
  const onResize = vi.fn()
  const utils = render(
    <Dock
      side="right"
      open
      size={340}
      onToggle={onToggle}
      onResize={onResize}
      title="Chart settings"
      {...props}
    >
      {props.children ?? <div>Plain children</div>}
    </Dock>
  )
  return { ...utils, onToggle, onResize }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("Dock — existing single-panel API (no regression)", () => {
  it("renders the plain title and children when panels is omitted", () => {
    renderDock()
    expect(screen.getByRole("heading", { name: "Chart settings" })).toBeInTheDocument()
    expect(screen.getByText("Plain children")).toBeInTheDocument()
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  })

  it("collapse button still fires onToggle", () => {
    const { onToggle } = renderDock()
    fireEvent.click(screen.getByRole("button", { name: /hide chart settings/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe("Dock — edge case: single-entry panels array", () => {
  it("renders no tab strip and behaves like the plain title API", () => {
    const onActivePanelChange = vi.fn()
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={[{ id: "settings", label: "Chart settings", content: <div>Settings body</div> }]}
        activePanelId="settings"
        onActivePanelChange={onActivePanelChange}
      />
    )
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Chart settings" })).toBeInTheDocument()
    expect(screen.getByText("Settings body")).toBeInTheDocument()
  })
})

describe("Dock — tabbed rendering with two or more panels", () => {
  it("renders a tab strip and switches the active panel's content when controlled", () => {
    function Controlled() {
      const [active, setActive] = useState("settings")
      return (
        <Dock
          side="right"
          open
          size={340}
          onToggle={vi.fn()}
          onResize={vi.fn()}
          title="Chart settings"
          panels={makePanels()}
          activePanelId={active}
          onActivePanelChange={setActive}
        />
      )
    }
    render(<Controlled />)

    expect(screen.getByRole("tablist")).toBeInTheDocument()
    expect(screen.getByText("Settings body")).toBeInTheDocument()
    expect(screen.queryByText("Ask body")).not.toBeInTheDocument()

    const askTab = screen.getByRole("tab", { name: /ask notes9/i })
    fireEvent.click(askTab)

    expect(screen.getByText("Ask body")).toBeInTheDocument()
    expect(screen.queryByText("Settings body")).not.toBeInTheDocument()
    expect(askTab).toHaveAttribute("aria-selected", "true")
  })

  it("exposes role=tab / aria-selected reflecting the active panel", () => {
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels()}
        activePanelId="ask"
        onActivePanelChange={vi.fn()}
      />
    )
    const settingsTab = screen.getByRole("tab", { name: /chart settings/i })
    const askTab = screen.getByRole("tab", { name: /ask notes9/i })
    expect(settingsTab).toHaveAttribute("aria-selected", "false")
    expect(askTab).toHaveAttribute("aria-selected", "true")
    // Roving tabindex: only the selected tab is in the normal tab order.
    expect(settingsTab).toHaveAttribute("tabindex", "-1")
    expect(askTab).toHaveAttribute("tabindex", "0")
  })

  it("gives the tablist an accessible name matching the dock title (no unlabeled tablist landmark)", () => {
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels()}
        activePanelId="settings"
        onActivePanelChange={vi.fn()}
      />
    )
    // The static <h2>{title}</h2> is gone once tabs render — the tablist
    // itself must carry the dock's name, or two docks on screen (e.g. left
    // and right) produce indistinguishable unlabeled tablist landmarks.
    expect(screen.getByRole("tablist", { name: "Chart settings" })).toBeInTheDocument()
  })

  it("moves focus and selection with ArrowRight / ArrowLeft (wrapping)", () => {
    const onActivePanelChange = vi.fn()
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels()}
        activePanelId="settings"
        onActivePanelChange={onActivePanelChange}
      />
    )
    const settingsTab = screen.getByRole("tab", { name: /chart settings/i })
    const askTab = screen.getByRole("tab", { name: /ask notes9/i })

    settingsTab.focus()
    fireEvent.keyDown(settingsTab, { key: "ArrowRight" })
    expect(onActivePanelChange).toHaveBeenCalledWith("ask")
    expect(document.activeElement).toBe(askTab)

    fireEvent.keyDown(askTab, { key: "ArrowRight" })
    expect(onActivePanelChange).toHaveBeenLastCalledWith("settings")
    expect(document.activeElement).toBe(settingsTab)

    fireEvent.keyDown(settingsTab, { key: "ArrowLeft" })
    expect(onActivePanelChange).toHaveBeenLastCalledWith("ask")
  })
})

describe("Dock — edge case: badge on an inactive tab must stay visible (AC-2 / ADR-024)", () => {
  it("renders the pending-plan badge on the ask tab while settings is active", () => {
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels({ askBadge: 1 })}
        activePanelId="settings"
        onActivePanelChange={vi.fn()}
      />
    )
    // settings (not ask) is active — the badge must still be visible.
    const askTab = screen.getByRole("tab", { name: /ask notes9/i })
    expect(askTab).toHaveAttribute("aria-selected", "false")
    const badge = within(askTab).getByLabelText("1 pending")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("1")
  })

  it("does not render a badge when the count is zero, null, or absent", () => {
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={[
          { id: "settings", label: "Chart settings", badge: 0, content: <div>Settings body</div> },
          { id: "ask", label: "Ask Notes9", badge: null, content: <div>Ask body</div> },
        ]}
        activePanelId="settings"
        onActivePanelChange={vi.fn()}
      />
    )
    expect(screen.queryByLabelText(/pending/)).not.toBeInTheDocument()
  })
})

describe("Dock — edge case: unset or stale activePanelId falls back to the first panel", () => {
  it("falls back to the first panel when activePanelId is undefined", () => {
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels()}
        onActivePanelChange={vi.fn()}
      />
    )
    expect(screen.getByText("Settings body")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /chart settings/i })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  it("falls back to the first panel when activePanelId no longer matches any panel", () => {
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels()}
        activePanelId="deleted-panel-id"
        onActivePanelChange={vi.fn()}
      />
    )
    expect(screen.getByText("Settings body")).toBeInTheDocument()
    expect(screen.queryByText("Ask body")).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /chart settings/i })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})

describe("Dock — tabs enabled without onActivePanelChange (controlled-without-onChange)", () => {
  it("warns in development: clicking a tab would move focus without changing the active panel", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels()}
        activePanelId="settings"
      />
    )
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("onActivePanelChange"))
    errorSpy.mockRestore()
  })

  it("does not warn once onActivePanelChange is supplied", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <Dock
        side="right"
        open
        size={340}
        onToggle={vi.fn()}
        onResize={vi.fn()}
        title="Chart settings"
        panels={makePanels()}
        activePanelId="settings"
        onActivePanelChange={vi.fn()}
      />
    )
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("does not warn for the single-panel API, which never renders tabs", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    renderDock()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe("useDockLayout — persisted tab selection", () => {
  it("defaults activePanelId to null and existing open/size API is unchanged", () => {
    const { result } = renderHook(() => useDockLayout(STORAGE_KEY))
    expect(result.current.activePanelId).toBeNull()
    expect(result.current.layout.right.open).toBe(true)
    expect(typeof result.current.toggle).toBe("function")
    expect(typeof result.current.setOpen).toBe("function")
    expect(typeof result.current.resize).toBe("function")
  })

  it("persists the active tab across a reload, alongside open state and size", () => {
    const first = renderHook(() => useDockLayout(STORAGE_KEY))
    act(() => {
      first.result.current.setActivePanelId("ask")
      first.result.current.resize("right", 420)
    })
    first.unmount()

    const second = renderHook(() => useDockLayout(STORAGE_KEY))
    expect(second.result.current.activePanelId).toBe("ask")
    expect(second.result.current.layout.right.size).toBe(420)
    expect(second.result.current.layout.right.open).toBe(true)
  })

  it("reads an old-format stored layout (no activePanelId key) without throwing", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        left: { size: 400, open: true },
        right: { size: 340, open: false },
        bottom: { size: 300, open: true },
      })
    )
    const { result } = renderHook(() => useDockLayout(STORAGE_KEY))
    expect(result.current.activePanelId).toBeNull()
    expect(result.current.layout.right.open).toBe(false)
  })

  it("ignores a corrupt stored value instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(() => renderHook(() => useDockLayout(STORAGE_KEY))).not.toThrow()
  })
})
