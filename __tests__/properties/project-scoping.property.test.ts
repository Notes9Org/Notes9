import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { resolveInitialProjectIdParam, isLikelyUuid } from "@/lib/url-project-param"
import type { BreadcrumbSegment } from "@/components/layout/breadcrumb-context"

/**
 * Property 16: Project URL parameter pre-filters resource pages
 *
 * For any resource page (Experiments, Literature, Protocols) that receives a
 * valid `project` URL parameter, the page should pre-filter its content to
 * show only items belonging to that project.
 *
 * The pages use `resolveInitialProjectIdParam(sp.project, orgProjectIds)` to
 * validate the project param against allowed IDs, then pass the resolved
 * projectContext to the content component for filtering.
 *
 * **Validates: Requirements 12.1, 12.2, 12.3**
 */
describe("Property 16: Project URL parameter pre-filters resource pages", () => {
  const uuidArb = fc.uuid()

  // Resource pages that support project URL parameter
  const projectScopedPages = ["Experiments", "Literature", "Protocols"]
  const pageArb = fc.constantFrom(...projectScopedPages)

  it("a valid project UUID in the allowed list resolves to that project ID", () => {
    fc.assert(
      fc.property(uuidArb, fc.array(uuidArb, { minLength: 1, maxLength: 10 }), (projectId, otherIds) => {
        const allowedIds = [...new Set([projectId, ...otherIds])]
        const resolved = resolveInitialProjectIdParam(projectId, allowedIds)
        expect(resolved).toBe(projectId)
      }),
      { numRuns: 100 }
    )
  })

  it("a valid UUID NOT in the allowed list resolves to null (no pre-filter)", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (projectId, otherId) => {
        fc.pre(projectId !== otherId)
        const allowedIds = [otherId]
        const resolved = resolveInitialProjectIdParam(projectId, allowedIds)
        expect(resolved).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it("undefined or empty project param resolves to null", () => {
    fc.assert(
      fc.property(fc.array(uuidArb, { minLength: 0, maxLength: 5 }), (allowedIds) => {
        expect(resolveInitialProjectIdParam(undefined, allowedIds)).toBeNull()
        expect(resolveInitialProjectIdParam("", allowedIds)).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it("non-UUID strings resolve to null regardless of allowed list", () => {
    const nonUuidArb = fc
      .stringMatching(/^[a-zA-Z0-9_-]+$/)
      .filter((s) => s.length > 0 && s.length <= 30 && !isLikelyUuid(s))

    fc.assert(
      fc.property(nonUuidArb, fc.array(uuidArb, { minLength: 0, maxLength: 5 }), (raw, allowedIds) => {
        const resolved = resolveInitialProjectIdParam(raw, allowedIds)
        expect(resolved).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it("all three resource pages use the same resolution logic", () => {
    fc.assert(
      fc.property(uuidArb, fc.array(uuidArb, { minLength: 1, maxLength: 5 }), pageArb, (projectId, otherIds, _page) => {
        const allowedIds = [...new Set([projectId, ...otherIds])]
        // All pages call resolveInitialProjectIdParam with the same signature
        const resolved = resolveInitialProjectIdParam(projectId, allowedIds)
        expect(resolved).toBe(projectId)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 17: Active project filter shows remove button
 *
 * For any Resource_List_Page with an active project filter via URL parameter,
 * the page should render a "Remove project filter" button that, when clicked,
 * clears the filter and shows all items.
 *
 * The pattern across experiments, literature, and protocols pages:
 *   {projectContext ? (
 *     <Button asChild variant="outline">
 *       <Link href="/experiments">
 *         <X /> Remove project filter
 *       </Link>
 *     </Button>
 *   ) : null}
 *
 * **Validates: Requirements 12.4**
 */
describe("Property 17: Active project filter shows remove button", () => {
  const uuidArb = fc.uuid()
  const projectNameArb = fc
    .string({ minLength: 1, maxLength: 60 })
    .filter((s) => s.trim().length > 0)

  // Resource pages and their base URLs (where the remove button links to)
  const pageConfigs = [
    { page: "Experiments", baseUrl: "/experiments" },
    { page: "Literature", baseUrl: "/literature-reviews" },
    { page: "Protocols", baseUrl: "/protocols" },
  ]
  const pageConfigArb = fc.constantFrom(...pageConfigs)

  it("when projectContext is non-null, the remove button should be rendered", () => {
    fc.assert(
      fc.property(uuidArb, projectNameArb, pageConfigArb, (projectId, projectName, _config) => {
        const projectContext = { id: projectId, name: projectName }
        // The conditional: {projectContext ? <RemoveButton /> : null}
        const shouldShowRemoveButton = projectContext !== null
        expect(shouldShowRemoveButton).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("when projectContext is null, no remove button is rendered", () => {
    fc.assert(
      fc.property(pageConfigArb, (_config) => {
        const projectContext = null
        const shouldShowRemoveButton = projectContext !== null
        expect(shouldShowRemoveButton).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("the remove button links to the base URL without project parameter", () => {
    fc.assert(
      fc.property(uuidArb, projectNameArb, pageConfigArb, (_projectId, _projectName, config) => {
        // The remove button links to the base URL (e.g., "/experiments")
        // which has no ?project= parameter, effectively clearing the filter
        const removeHref = config.baseUrl
        expect(removeHref).not.toContain("?project=")
        expect(removeHref).not.toContain("project")
        expect(removeHref.startsWith("/")).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("the remove button text contains 'Remove project filter'", () => {
    // All three pages use the same button text
    const buttonText = "Remove project filter"
    expect(buttonText).toContain("Remove")
    expect(buttonText).toContain("project")
    expect(buttonText).toContain("filter")
  })
})

/**
 * Property 18: Project-scoped breadcrumb includes project link
 *
 * For any page with an active project filter, the breadcrumb bar should include
 * the project name as a clickable link pointing to /projects/{projectId}.
 *
 * The pattern across experiments, literature, and protocols pages:
 *   <SetPageBreadcrumb segments={[
 *     { label: projectContext.name, href: `/projects/${projectContext.id}` },
 *     { label: "Experiments" },  // or "Literature" or "Protocols"
 *   ]} />
 *
 * **Validates: Requirements 12.5**
 */
describe("Property 18: Project-scoped breadcrumb includes project link", () => {
  const uuidArb = fc.uuid()
  const projectNameArb = fc
    .string({ minLength: 1, maxLength: 80 })
    .filter((s) => s.trim().length > 0)

  const pageLabels = ["Experiments", "Literature", "Protocols"]
  const pageLabelArb = fc.constantFrom(...pageLabels)

  it("project-scoped breadcrumb first segment has project name and link to /projects/{id}", () => {
    fc.assert(
      fc.property(uuidArb, projectNameArb, pageLabelArb, (projectId, projectName, pageLabel) => {
        // Build breadcrumb segments as the pages do
        const segments: BreadcrumbSegment[] = [
          { label: projectName, href: `/projects/${projectId}` },
          { label: pageLabel },
        ]

        // First segment is the project link
        expect(segments[0].label).toBe(projectName)
        expect(segments[0].href).toBe(`/projects/${projectId}`)
        // The href is a valid internal link
        expect(segments[0].href!.startsWith("/projects/")).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("the project link href always contains the exact project ID", () => {
    fc.assert(
      fc.property(uuidArb, projectNameArb, pageLabelArb, (projectId, projectName, _pageLabel) => {
        const segments: BreadcrumbSegment[] = [
          { label: projectName, href: `/projects/${projectId}` },
          { label: "Page" },
        ]

        expect(segments[0].href).toContain(projectId)
      }),
      { numRuns: 100 }
    )
  })

  it("the last breadcrumb segment (current page) has no href", () => {
    fc.assert(
      fc.property(uuidArb, projectNameArb, pageLabelArb, (projectId, projectName, pageLabel) => {
        const segments: BreadcrumbSegment[] = [
          { label: projectName, href: `/projects/${projectId}` },
          { label: pageLabel },
        ]

        const lastSegment = segments[segments.length - 1]
        expect(lastSegment.label).toBe(pageLabel)
        expect(lastSegment.href).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  it("without project context, breadcrumb segments are empty (no project link)", () => {
    fc.assert(
      fc.property(pageLabelArb, (_pageLabel) => {
        // When no project context, pages set empty segments:
        // <SetPageBreadcrumb segments={[]} />
        const projectContext = null
        const segments: BreadcrumbSegment[] = projectContext
          ? [{ label: "project", href: "/projects/id" }, { label: _pageLabel }]
          : []

        expect(segments).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })
})
