import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

/**
 * Sidebar navigation items — mirrors the `navigation` array in app-sidebar.tsx
 */
const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Projects", href: "/projects" },
  { name: "Catalyst", href: "/catalyst" },
  { name: "Research map", href: "/research-map" },
  { name: "Writing", href: "/papers" },
  { name: "Reports", href: "/reports" },
]

/**
 * Replicates the isActive logic from AppSidebar:
 *
 *   const pathMatches = pathname === item.href || pathname.startsWith(item.href + "/")
 *   const isActive = mounted && pathMatches
 */
function computeIsActive(
  pathname: string,
  itemHref: string,
  mounted: boolean
): boolean {
  const pathMatches =
    pathname === itemHref || pathname.startsWith(itemHref + "/")
  return mounted && pathMatches
}

/**
 * Property 19: Sidebar active state matches current pathname
 *
 * For any navigation item in the sidebar and any current pathname, the item
 * should be marked as active if and only if the pathname equals the item's
 * href or starts with {href}/.
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

  it("when pathname exactly matches item.href, item is active (mounted)", () => {
    fc.assert(
      fc.property(navItemArb, (item) => {
        const isActive = computeIsActive(item.href, item.href, true)
        expect(isActive).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("when pathname starts with item.href + '/', item is active (mounted)", () => {
    fc.assert(
      fc.property(navItemArb, subPath.filter((s) => s.length > 0), (item, sub) => {
        const pathname = item.href + sub
        const isActive = computeIsActive(pathname, item.href, true)
        expect(isActive).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("when pathname does not match item.href, item is NOT active", () => {
    fc.assert(
      fc.property(navItemArb, navItemArb, (currentItem, otherItem) => {
        fc.pre(currentItem.href !== otherItem.href)
        fc.pre(!currentItem.href.startsWith(otherItem.href + "/"))
        const isActive = computeIsActive(currentItem.href, otherItem.href, true)
        expect(isActive).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("before mount (mounted=false), no item is ever active — prevents hydration mismatch", () => {
    fc.assert(
      fc.property(navItemArb, (item) => {
        const isActive = computeIsActive(item.href, item.href, false)
        expect(isActive).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
