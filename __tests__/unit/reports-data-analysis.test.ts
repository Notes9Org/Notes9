import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { buildReportSystemPrompt } from "@/app/api/reports/generate/route"

/**
 * Reports Data Analysis API route unit tests.
 *
 * The API route is a server-side module that requires Next.js request/response
 * internals and environment variables. We verify the implementation by reading
 * the source code and checking for expected patterns (same approach as
 * dashboard.test.tsx), plus direct tests of the exported buildReportSystemPrompt.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relativePath), "utf-8")
}

const routeSource = readSource("app/api/reports/generate/route.ts")

describe("API route upstream body construction (Req 3.1, 3.5)", () => {
  it("uses buildReportSystemPrompt to construct the system prompt", () => {
    expect(routeSource).toContain("buildReportSystemPrompt")
  })

  it("sends enrichedQuery as the content field to the upstream API", () => {
    expect(routeSource).toContain("content: enrichedQuery")
  })

  it("sends an empty history array in the upstream request", () => {
    expect(routeSource).toContain("history: []")
  })

  it('generates a session_id with "report-" prefix', () => {
    expect(routeSource).toMatch(/session_id:\s*`report-/)
  })
})

describe("401 when token missing (Req 3.3)", () => {
  it("returns 401 status when no Bearer token is provided", () => {
    expect(routeSource).toContain("status: 401")
  })

  it("returns an authorization required error message", () => {
    expect(routeSource).toContain("Authorization required")
  })
})

describe("503 when no AI service configured (Req 3.4)", () => {
  it("returns 503 status when no AI service URL is available", () => {
    expect(routeSource).toContain("status: 503")
  })

  it('returns "No AI service configured" error message', () => {
    expect(routeSource).toContain("No AI service configured")
  })
})

describe("400 when query empty or projectName missing (Req 3.2)", () => {
  it("returns 400 status for invalid requests", () => {
    expect(routeSource).toContain("status: 400")
  })

  it('returns "query is required" error when query is missing', () => {
    expect(routeSource).toContain("query is required")
  })

  it('returns "projectName is required" error when projectName is missing', () => {
    expect(routeSource).toContain("projectName is required")
  })
})

describe("buildReportSystemPrompt", () => {
  it("includes the project name in the output", () => {
    const prompt = buildReportSystemPrompt({ projectName: "Cell Viability Study" })
    expect(prompt).toContain("Cell Viability Study")
  })

  it("includes experiment names when provided", () => {
    const prompt = buildReportSystemPrompt({
      projectName: "Protein Analysis",
      experimentNames: ["Western Blot Run 1", "ELISA Assay"],
    })
    expect(prompt).toContain("Western Blot Run 1")
    expect(prompt).toContain("ELISA Assay")
  })

  it("does not include EXPERIMENTS line when no experiment names provided", () => {
    const prompt = buildReportSystemPrompt({ projectName: "Solo Project" })
    expect(prompt).not.toContain("EXPERIMENTS:")
  })

  it("includes expected report section headers", () => {
    const prompt = buildReportSystemPrompt({ projectName: "Any Project" })
    expect(prompt).toContain("Executive Summary")
    expect(prompt).toContain("Data Overview")
    expect(prompt).toContain("Analysis Results")
    expect(prompt).toContain("Conclusions & Recommendations")
  })
})

// ---------------------------------------------------------------------------
// Report Generator Dialog unit tests
// ---------------------------------------------------------------------------

const dialogSource = readSource("app/(app)/reports/report-generator-dialog.tsx")

describe("Dialog has correct form fields (Req 1.1)", () => {
  it("renders a project select field", () => {
    expect(dialogSource).toContain("project-select")
  })

  it('shows "Select a project" placeholder', () => {
    expect(dialogSource).toContain("Select a project")
  })

  it("renders a query textarea for analysis input", () => {
    expect(dialogSource).toContain("query-textarea")
  })

  it('labels the textarea "Analysis Query"', () => {
    expect(dialogSource).toContain("Analysis Query")
  })

  it("renders experiment selection", () => {
    expect(dialogSource).toContain("Experiments")
  })
})

describe("Loading indicator during generation (Req 7.4)", () => {
  it('displays "Generating" text while AI is working', () => {
    expect(dialogSource).toContain("Generating")
  })

  it("uses an animated spinner for the loading indicator", () => {
    expect(dialogSource).toContain("animate-spin")
  })

  it("tracks generation state via isGenerating", () => {
    expect(dialogSource).toContain("isGenerating")
  })
})

describe("Error display with retry (Req 1.6)", () => {
  it("renders a Retry button on generation failure", () => {
    expect(dialogSource).toContain("Retry")
  })

  it("manages error state for generation failures", () => {
    expect(dialogSource).toMatch(/error/)
  })
})

describe("Supabase persistence fields (Req 6.1, 6.2, 6.3)", () => {
  it('sets initial report status to "draft"', () => {
    expect(dialogSource).toContain('status: "draft"')
  })

  it('sets report_type to "data_analysis"', () => {
    expect(dialogSource).toContain('report_type: "data_analysis"')
  })

  it("stores the generated_by user id", () => {
    expect(dialogSource).toContain("generated_by")
  })
})

// ---------------------------------------------------------------------------
// Report Detail View unit tests
// ---------------------------------------------------------------------------

const detailPageSource = readSource("app/(app)/reports/[id]/page.tsx")
const detailViewSource = readSource("app/(app)/reports/[id]/report-detail-view.tsx")

describe("Renders not-found for non-existent report (Req 4.5)", () => {
  it("calls notFound() when report does not exist", () => {
    expect(detailPageSource).toContain("notFound()")
  })

  it("imports notFound from next/navigation", () => {
    expect(detailPageSource).toContain("notFound")
    expect(detailPageSource).toContain("next/navigation")
  })
})

describe("Renders rich text content (Req 4.3)", () => {
  it("uses TiptapEditor for editable report content", () => {
    expect(detailViewSource).toContain("TiptapEditor")
  })

  it("uses auto-save for content persistence", () => {
    expect(detailViewSource).toContain("useAutoSave")
  })
})

describe("Navigates to /reports/[id] on view click (Req 4.1)", () => {
  it("detail page handles the /reports/[id] route pattern", () => {
    expect(detailPageSource).toContain("params")
    expect(detailPageSource).toContain("id")
  })

  it("extracts the id from route params", () => {
    expect(detailPageSource).toMatch(/\{\s*id\s*\}/)
  })
})

describe("Detail page authenticates user (Req 4.1)", () => {
  it("calls getUser() to authenticate", () => {
    expect(detailPageSource).toContain("getUser()")
  })

  it("redirects unauthenticated users to /auth/login", () => {
    expect(detailPageSource).toContain('redirect("/auth/login")')
  })
})


// ---------------------------------------------------------------------------
// Error Boundary & Loading State unit tests
// ---------------------------------------------------------------------------

const errorBoundarySource = readSource("app/(app)/reports/error.tsx")
const loadingSource = readSource("app/(app)/reports/loading.tsx")

describe("Error boundary renders error message and retry button (Req 7.2)", () => {
  it("displays the error message to the user", () => {
    expect(errorBoundarySource).toContain("error.message")
  })

  it('renders a "Try again" retry button', () => {
    expect(errorBoundarySource).toContain("Try again")
  })

  it("calls the reset function for retry", () => {
    expect(errorBoundarySource).toContain("reset")
  })

  it('includes "use client" directive for client-side error handling', () => {
    expect(errorBoundarySource).toContain("use client")
  })
})

describe("Loading skeleton follows existing patterns (Req 7.1)", () => {
  it("uses animate-pulse for skeleton animation", () => {
    expect(loadingSource).toContain("animate-pulse")
  })

  it("uses bg-muted for skeleton placeholder backgrounds", () => {
    expect(loadingSource).toContain("bg-muted")
  })

  it("uses rounded styling for skeleton elements", () => {
    const hasRounded = loadingSource.includes("rounded-md") || loadingSource.includes("rounded-xl")
    expect(hasRounded).toBe(true)
  })
})
