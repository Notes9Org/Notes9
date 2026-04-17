import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

/**
 * Sidebar navigation items — mirrors the `navigation` array in app-sidebar.tsx
 */
const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Projects", href: "/projects" },
  { name: "Experiments", href: "/experiments" },
  { name: "Lab Notes", href: "/lab-notes" },
  { name: "Samples", href: "/samples" },
  { name: "Equipment", href: "/equipment" },
  { name: "Protocols", href: "/protocols" },
  { name: "Literature", href: "/literature-reviews" },
  { name: "Research map", href: "/research-map" },
  { name: "Writing", href: "/papers" },
]

/**
 * Routes that suppress active state when a `?project=` query param is present.
 * These are the project-scoped deep link routes from app-sidebar.tsx.
 */
const projectScopedHrefs = ["/experiments", "/literature-reviews", "/protocols"]

/**
 * Replicates the isActive logic from AppSidebar:
 *
 *   const pathMatches = pathname === item.href || pathname.startsWith(item.href + "/")
 *   const hasProjectScope = (searchParams.get("project")?.trim() ?? "") !== ""
 *   const suppressActiveForProjectDeepLink =
 *     hasProjectScope &&
 *     (item.href === "/literature-reviews" ||
 *      item.href === "/protocols" ||
 *      item.href === "/experiments")
 *   const isActive = mounted && pathMatches && !suppressActiveForProjectDeepLink
 */
function computeIsActive(
  pathname: string,
  itemHref: string,
  projectParam: string | null,
  mounted: boolean
): boolean {
  const pathMatches =
    pathname === itemHref || pathname.startsWith(itemHref + "/")
  const hasProjectScope = (projectParam?.trim() ?? "") !== ""
  const suppressActiveForProjectDeepLink =
    hasProjectScope && projectScopedHrefs.includes(itemHref)
  return mounted && pathMatches && !suppressActiveForProjectDeepLink
}

/**
 * Property 19: Sidebar active state matches current pathname
 *
 * For any navigation item in the sidebar and any current pathname, the item
 * should be marked as active if and only if the pathname equals the item's
 * href or starts with {href}/, and the URL does not contain a project query
 * parameter for experiment/literature/protocol routes.
 *
 * **Validates: Requirements 15.1, 15.2**
 */
describe("Property 19: Sidebar active state matches current pathname", () => {
  const navItemArb = fc.constantFrom(...navigation)

  const pathSegment = fc
    .stringMatching(/^[a-zA-Z0-9_-]+$/)
    .filter((s) => s.length > 0 && s.length <= 20)

  const subPath = fc.oneof(
    fc.constant(""),
    pathSegment.map((s) => "/" + s)
  )

  const uuidArb = fc.uuid()

  it("when pathname exactly matches item.href, item is active (no project param, mounted)", () => {
    fc.assert(
      fc.property(navItemArb, (item) => {
        const isActive = computeIsActive(item.href, item.href, null, true)
        expect(isActive).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("when pathname starts with item.href + '/', item is active (no project param, mounted)", () => {
    fc.assert(
      fc.property(navItemArb, subPath.filter((s) => s.length > 0), (item, sub) => {
        const pathname = item.href + sub
        const isActive = computeIsActive(pathname, item.href, null, true)
        expect(isActive).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("when pathname does not match item.href, item is NOT active", () => {
    fc.assert(
      fc.property(navItemArb, navItemArb, (currentItem, otherItem) => {
        fc.pre(currentItem.href !== otherItem.href)
        // Ensure the pathname doesn't accidentally start with otherItem.href
        fc.pre(!currentItem.href.startsWith(otherItem.href + "/"))
        const isActive = computeIsActive(currentItem.href, otherItem.href, null, true)
        expect(isActive).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("project-scoped routes suppress active state when ?project= is present", () => {
    const projectScopedItemArb = fc.constantFrom(
      ...navigation.filter((n) => projectScopedHrefs.includes(n.href))
    )

    fc.assert(
      fc.property(projectScopedItemArb, uuidArb, (item, projectId) => {
        // Even though pathname matches, the project param suppresses active state
        const isActive = computeIsActive(item.href, item.href, projectId, true)
        expect(isActive).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("non-project-scoped routes are NOT suppressed even with ?project= param", () => {
    const nonProjectScopedItemArb = fc.constantFrom(
      ...navigation.filter((n) => !projectScopedHrefs.includes(n.href))
    )

    fc.assert(
      fc.property(nonProjectScopedItemArb, uuidArb, (item, projectId) => {
        // Non-scoped routes (dashboard, projects, samples, etc.) stay active
        const isActive = computeIsActive(item.href, item.href, projectId, true)
        expect(isActive).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("before mount (mounted=false), no item is ever active — prevents hydration mismatch", () => {
    fc.assert(
      fc.property(navItemArb, (item) => {
        const isActive = computeIsActive(item.href, item.href, null, false)
        expect(isActive).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("empty project param string does not suppress active state", () => {
    const projectScopedItemArb = fc.constantFrom(
      ...navigation.filter((n) => projectScopedHrefs.includes(n.href))
    )

    fc.assert(
      fc.property(projectScopedItemArb, (item) => {
        // Empty string or whitespace-only project param should not suppress
        const isActiveEmpty = computeIsActive(item.href, item.href, "", true)
        expect(isActiveEmpty).toBe(true)

        const isActiveWhitespace = computeIsActive(item.href, item.href, "   ", true)
        expect(isActiveWhitespace).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
