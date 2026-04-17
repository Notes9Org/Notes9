import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock next/navigation before importing the component
const mockPathname = vi.fn(() => "/dashboard")
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}))

// Mock the video loader component
vi.mock("@/components/brand/notes9-video-loader", () => ({
  Notes9VideoLoader: ({ title }: { title: string }) => (
    <div data-testid="video-loader">{title}</div>
  ),
}))

import { render, act } from "@testing-library/react"
import { NavigationLoader } from "@/components/navigation-loader"

describe("NavigationLoader timeout values and console warning", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockPathname.mockReturnValue("/dashboard")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("MAX_LOADER_DURATION_MS is 8000ms for standard pages", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { container } = render(<NavigationLoader />)

    // Mount the component
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    // Simulate a click on an internal link
    const link = document.createElement("a")
    link.setAttribute("href", "/projects")
    link.textContent = "Projects"
    document.body.appendChild(link)

    await act(async () => {
      const clickEvent = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(clickEvent, "target", { value: link })
      link.dispatchEvent(clickEvent)
    })

    // Advance time to just before the safety timeout
    await act(async () => {
      vi.advanceTimersByTime(7999)
    })

    // The loader should still be visible (safety timeout hasn't fired yet)
    // Advance to exactly 8000ms
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    // console.warn should have been called with the safety timeout message
    expect(warnSpy).toHaveBeenCalledWith(
      "[NavigationLoader] Safety timeout fired for route: /projects"
    )

    document.body.removeChild(link)
    warnSpy.mockRestore()
  })

  it("AUTH_MAX_LOADER_DURATION_MS is 12000ms for auth pages", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    render(<NavigationLoader />)

    // Mount the component
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    // Simulate a custom navigation event for an auth page
    await act(async () => {
      const event = new CustomEvent("notes9:navigation-start", {
        detail: { label: "Sign In", href: "/auth/sign-up", kind: "auth" },
      })
      window.dispatchEvent(event)
    })

    // Advance to just before 12000ms
    await act(async () => {
      vi.advanceTimersByTime(11999)
    })

    // console.warn should NOT have been called yet
    expect(warnSpy).not.toHaveBeenCalled()

    // Advance to exactly 12000ms
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    // Now it should have fired
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[NavigationLoader] Safety timeout fired for route:")
    )

    warnSpy.mockRestore()
  })

  it("console.warn includes the destination route when safety timeout fires", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    render(<NavigationLoader />)

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    // Simulate clicking a link to /experiments
    const link = document.createElement("a")
    link.setAttribute("href", "/experiments?project=123")
    link.textContent = "Experiments"
    document.body.appendChild(link)

    await act(async () => {
      const clickEvent = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(clickEvent, "target", { value: link })
      link.dispatchEvent(clickEvent)
    })

    // Fire the safety timeout
    await act(async () => {
      vi.advanceTimersByTime(8000)
    })

    expect(warnSpy).toHaveBeenCalledWith(
      "[NavigationLoader] Safety timeout fired for route: /experiments"
    )

    document.body.removeChild(link)
    warnSpy.mockRestore()
  })
})
