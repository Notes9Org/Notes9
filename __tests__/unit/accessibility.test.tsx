import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Accessibility attribute tests for interactive elements.
 *
 * These tests verify that the correct aria-labels and accessibility
 * attributes exist in the source code of components that are difficult
 * to render in isolation (due to Supabase, Next.js router, etc.).
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relativePath), "utf-8")
}

describe("Accessibility: grid/table toggle aria-labels (Req 13.3)", () => {
  const pages = [
    { name: "Projects (ProjectsPageContent)", file: "app/(app)/projects/project-list.tsx" },
    { name: "Experiments (ExperimentsPageContent)", file: "app/(app)/experiments/experiment-list.tsx" },
    { name: "Samples", file: "app/(app)/samples/samples-page-content.tsx" },
    { name: "Equipment", file: "app/(app)/equipment/equipment-page-content.tsx" },
    { name: "Lab Notes", file: "app/(app)/lab-notes/page.tsx" },
    { name: "Papers", file: "app/(app)/papers/paper-list.tsx" },
  ]

  for (const { name, file } of pages) {
    it(`${name} grid toggle button has aria-label="Switch to grid view"`, () => {
      const src = readSource(file)
      expect(src).toContain('aria-label="Switch to grid view"')
    })

    it(`${name} table toggle button has aria-label="Switch to table view"`, () => {
      const src = readSource(file)
      expect(src).toContain('aria-label="Switch to table view"')
    })
  }

  it("ProjectList standalone toggle also has aria-labels", () => {
    const src = readSource("app/(app)/projects/project-list.tsx")
    // There should be at least 2 occurrences of each (PageContent + List)
    const gridMatches = src.match(/aria-label="Switch to grid view"/g)
    const tableMatches = src.match(/aria-label="Switch to table view"/g)
    expect(gridMatches!.length).toBeGreaterThanOrEqual(2)
    expect(tableMatches!.length).toBeGreaterThanOrEqual(2)
  })

  it("ExperimentList standalone toggle also has aria-labels", () => {
    const src = readSource("app/(app)/experiments/experiment-list.tsx")
    const gridMatches = src.match(/aria-label="Switch to grid view"/g)
    const tableMatches = src.match(/aria-label="Switch to table view"/g)
    expect(gridMatches!.length).toBeGreaterThanOrEqual(2)
    expect(tableMatches!.length).toBeGreaterThanOrEqual(2)
  })
})

describe("Accessibility: mobile menu button (Req 13.1)", () => {
  it('mobile menu button has aria-label="Open navigation"', () => {
    const src = readSource("components/layout/app-layout.tsx")
    expect(src).toContain('aria-label="Open navigation"')
  })
})

describe("Accessibility: password visibility toggle (Req 13.2)", () => {
  it('login page password toggle has dynamic aria-label for show/hide', () => {
    const src = readSource("app/auth/login/page.tsx")
    expect(src).toContain('aria-label={showPassword ? "Hide password" : "Show password"}')
  })
})

describe("Accessibility: NavigationLoader pointer-events (Req 13.4)", () => {
  it("NavigationLoader overlay has pointer-events-none class", () => {
    const src = readSource("components/navigation-loader.tsx")
    expect(src).toContain("pointer-events-none")
  })
})

describe("Accessibility: Right sidebar SheetTitle (Req 13.5)", () => {
  it("Right sidebar Sheet has a visually hidden SheetTitle for screen readers", () => {
    const src = readSource("components/layout/app-layout.tsx")
    // The SheetHeader wrapping the SheetTitle should have sr-only class
    expect(src).toContain('SheetHeader className="sr-only"')
    expect(src).toContain("<SheetTitle>AI Assistant</SheetTitle>")
  })
})


describe("Toast providers in root layout (Req 14.1)", () => {
  it("root layout imports shadcn Toaster component", () => {
    const src = readSource("app/layout.tsx")
    expect(src).toContain('import { Toaster } from "@/components/ui/toaster"')
  })

  it("root layout imports Sonner toast component", () => {
    const src = readSource("app/layout.tsx")
    expect(src).toContain('import { Toaster as Sonner } from "@/components/ui/sonner"')
  })

  it("root layout renders both <Toaster /> and <Sonner /> in the JSX", () => {
    const src = readSource("app/layout.tsx")
    expect(src).toContain("<Toaster />")
    expect(src).toContain("<Sonner />")
  })
})
