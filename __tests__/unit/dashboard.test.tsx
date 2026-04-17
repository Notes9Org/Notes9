import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Dashboard quick actions and recent items tests.
 *
 * The dashboard is a server component that cannot be rendered in a unit test
 * environment (requires Supabase server client, async component, etc.).
 * We verify the implementation by reading the source code and checking for
 * expected patterns.
 *
 * Requirements: 10.1, 10.4, 10.5
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relativePath), "utf-8")
}

const dashboardSource = readSource("app/(app)/dashboard/page.tsx")

describe("Dashboard quick actions (Req 10.1)", () => {
  it('renders a "Create New Project" quick action button', () => {
    expect(dashboardSource).toContain("Create New Project")
  })

  it('renders an "Add Experiment" quick action button', () => {
    expect(dashboardSource).toContain("Add Experiment")
  })

  it('renders a "Record Sample" quick action button', () => {
    expect(dashboardSource).toContain("Record Sample")
  })

  it("quick action buttons link to the correct creation pages", () => {
    expect(dashboardSource).toContain('href="/projects/new"')
    expect(dashboardSource).toContain('href="/experiments/new"')
    expect(dashboardSource).toContain('href="/samples/new"')
  })
})

describe("Dashboard recent items fallback text (Req 10.4, 10.5)", () => {
  it('displays "No recent experiments" when there are no experiments', () => {
    expect(dashboardSource).toContain("No recent experiments")
  })

  it('displays "No recent notes" when there are no lab notes', () => {
    expect(dashboardSource).toContain("No recent notes")
  })
})
