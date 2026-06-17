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

const firstRunSource = readSource("app/(app)/dashboard/dashboard-first-run.tsx")
const recentWorkSource = readSource("app/(app)/dashboard/dashboard-recent-work.tsx")

// The dashboard was redesigned: first-time users see a "Start with a project"
// empty state (DashboardFirstRun) whose primary CTA creates a project, and the
// recent-work panel (DashboardRecentWork) shows a fallback when there is no
// recent activity. These assertions track that current output.
describe("Dashboard first-run create CTA (Req 10.1)", () => {
  it('renders a "Create your first project" CTA', () => {
    expect(firstRunSource).toContain("Create your first project")
  })

  it('the create CTA links to the project creation page', () => {
    expect(firstRunSource).toContain('href="/projects/new"')
  })

  it("surfaces the entity hierarchy (experiments, lab notes, samples, protocols)", () => {
    expect(firstRunSource).toContain('title="Experiments"')
    expect(firstRunSource).toContain('title="Lab notes"')
    expect(firstRunSource).toContain('title="Samples"')
    expect(firstRunSource).toContain('title="Protocols"')
  })
})

describe("Dashboard recent work fallback text (Req 10.4, 10.5)", () => {
  it('displays a "No recent work" fallback when there is no recent activity', () => {
    expect(recentWorkSource).toContain("No recent work")
  })
})
