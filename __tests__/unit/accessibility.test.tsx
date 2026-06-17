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
  // The grid/table toggle was extracted into the shared
  // components/ui/view-mode-toggle.tsx component. The aria-labels now live
  // there, and each list page renders <ViewModeToggle>. We assert the shared
  // component carries the labels and that each page consumes it.
  const toggleSource = readSource("components/ui/view-mode-toggle.tsx")

  it('shared ViewModeToggle has aria-label="Switch to grid view"', () => {
    expect(toggleSource).toContain('aria-label="Switch to grid view"')
  })

  it('shared ViewModeToggle has aria-label="Switch to table view"', () => {
    expect(toggleSource).toContain('aria-label="Switch to table view"')
  })

  const pages = [
    { name: "Projects (ProjectsPageContent)", file: "app/(app)/projects/project-list.tsx" },
    { name: "Experiments (ExperimentsPageContent)", file: "app/(app)/experiments/experiment-list.tsx" },
    { name: "Samples", file: "app/(app)/samples/samples-page-content.tsx" },
    { name: "Equipment", file: "app/(app)/equipment/equipment-page-content.tsx" },
    { name: "Lab Notes", file: "app/(app)/lab-notes/page.tsx" },
    { name: "Papers", file: "app/(app)/papers/paper-list.tsx" },
  ]

  for (const { name, file } of pages) {
    it(`${name} renders the accessible ViewModeToggle`, () => {
      const src = readSource(file)
      expect(src).toContain("ViewModeToggle")
    })
  }
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
    // The SheetHeader wrapping the SheetTitle should have sr-only class.
    // The right drawer hosts two assistants (Protocol AI and Catalyst), each
    // with its own visually-hidden SheetTitle.
    expect(src).toContain('SheetHeader className="sr-only"')
    expect(src).toContain("<SheetTitle>Protocol AI</SheetTitle>")
    expect(src).toContain("<SheetTitle>Catalyst</SheetTitle>")
  })
})


describe("Toast provider in root layout (Req 14.1)", () => {
  // Notifications now route exclusively through sonner. The radix-based
  // <Toaster /> was removed to avoid two toast UIs running side-by-side;
  // the legacy useToast() hook is an adapter that forwards to sonner.
  it("root layout imports Sonner toast component", () => {
    const src = readSource("app/layout.tsx")
    expect(src).toContain('import { Toaster as Sonner } from "@/components/ui/sonner"')
  })

  it("root layout renders <Sonner /> in the JSX", () => {
    const src = readSource("app/layout.tsx")
    expect(src).toContain("<Sonner />")
  })
})
