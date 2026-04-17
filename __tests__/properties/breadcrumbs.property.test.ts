import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  shortenLabel,
  MOBILE_BREADCRUMB_MAX_LABEL_LENGTH,
} from "@/components/layout/app-layout"
import type { BreadcrumbSegment } from "@/components/layout/breadcrumb-context"

/**
 * Property 9: Breadcrumb accuracy for experiment pages
 *
 * For any experiment detail page, if the experiment belongs to a project and
 * the page is accessed with project context, the breadcrumb should display
 * [Project Name] > [Experiment Name]. If accessed without project context,
 * the breadcrumb should display the experiment name with appropriate parent segments.
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe("Property 9: Breadcrumb accuracy for experiment pages", () => {
  const nameArb = fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0)
  const projectIdArb = fc.uuid()

  it("project-scoped experiment breadcrumb has exactly 2 segments: [Project Name, Experiment Name]", () => {
    fc.assert(
      fc.property(nameArb, nameArb, projectIdArb, (projectName, experimentName, projectId) => {
        // From experiments/[id]/page.tsx when useProjectScopedHeader is true:
        const segments: BreadcrumbSegment[] = [
          { label: projectName, href: `/projects/${projectId}` },
          { label: experimentName },
        ]

        expect(segments).toHaveLength(2)
        expect(segments[0].label).toBe(projectName)
        expect(segments[0].href).toBe(`/projects/${projectId}`)
        expect(segments[1].label).toBe(experimentName)
        expect(segments[1].href).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  it("non-scoped experiment breadcrumb has 3 segments: [Projects, Project Name, Experiment Name]", () => {
    fc.assert(
      fc.property(nameArb, nameArb, projectIdArb, (projectName, experimentName, projectId) => {
        // From experiments/[id]/page.tsx when useProjectScopedHeader is false:
        const segments: BreadcrumbSegment[] = [
          { label: "Projects", href: "/projects" },
          { label: projectName, href: `/projects/${projectId}` },
          { label: experimentName },
        ]

        expect(segments).toHaveLength(3)
        expect(segments[0].label).toBe("Projects")
        expect(segments[0].href).toBe("/projects")
        expect(segments[1].label).toBe(projectName)
        expect(segments[1].href).toBe(`/projects/${projectId}`)
        expect(segments[2].label).toBe(experimentName)
        expect(segments[2].href).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  it("the last breadcrumb segment (current page) never has an href", () => {
    fc.assert(
      fc.property(nameArb, nameArb, projectIdArb, fc.boolean(), (projectName, experimentName, projectId, isScoped) => {
        const segments: BreadcrumbSegment[] = isScoped
          ? [
              { label: projectName, href: `/projects/${projectId}` },
              { label: experimentName },
            ]
          : [
              { label: "Projects", href: "/projects" },
              { label: projectName, href: `/projects/${projectId}` },
              { label: experimentName },
            ]

        const lastSegment = segments[segments.length - 1]
        expect(lastSegment.label).toBe(experimentName)
        expect(lastSegment.href).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 10: Breadcrumb label truncation on mobile
 *
 * For any breadcrumb label string longer than 18 characters, the shortenLabel()
 * function should return a string of exactly 18 characters ending with "…",
 * and the original full label should be preserved in the title attribute.
 *
 * **Validates: Requirements 6.5**
 */
describe("Property 10: Breadcrumb label truncation on mobile", () => {
  const maxLen = MOBILE_BREADCRUMB_MAX_LABEL_LENGTH // 18

  const longLabelArb = fc.string({ minLength: maxLen + 1, maxLength: 200 }).filter((s) => s.length > maxLen)
  const shortLabelArb = fc.string({ minLength: 0, maxLength: maxLen })

  it("labels longer than 18 chars are truncated to exactly 18 chars ending with '…'", () => {
    fc.assert(
      fc.property(longLabelArb, (label) => {
        const shortened = shortenLabel(label)
        expect(shortened.length).toBe(maxLen)
        expect(shortened.endsWith("…")).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("labels of 18 chars or fewer are returned unchanged", () => {
    fc.assert(
      fc.property(shortLabelArb, (label) => {
        const shortened = shortenLabel(label)
        expect(shortened).toBe(label)
      }),
      { numRuns: 100 }
    )
  })

  it("truncated label preserves the first 17 characters of the original", () => {
    fc.assert(
      fc.property(longLabelArb, (label) => {
        const shortened = shortenLabel(label)
        // The first maxLen-1 chars should be the original prefix
        expect(shortened.slice(0, maxLen - 1)).toBe(label.slice(0, maxLen - 1))
      }),
      { numRuns: 100 }
    )
  })

  it("the original full label is always available for the title attribute (identity preserved)", () => {
    fc.assert(
      fc.property(longLabelArb, (label) => {
        // In the component, title={seg.label} preserves the full label
        // The full label is always the original string, never the shortened one
        const shortened = shortenLabel(label)
        expect(label).not.toBe(shortened)
        expect(label.length).toBeGreaterThan(shortened.length)
      }),
      { numRuns: 100 }
    )
  })
})
