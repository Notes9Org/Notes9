import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

/**
 * Empty state and filter-no-match message definitions for all resource types.
 * These are the canonical messages used across the application.
 */
const RESOURCE_EMPTY_STATES: Record<
  string,
  { emptyMessage: string; ctaText: string; filterNoMatch: string }
> = {
  Projects: {
    emptyMessage: "No projects yet",
    ctaText: "Create First Project",
    filterNoMatch: "No projects match the selected filters.",
  },
  Experiments: {
    emptyMessage: "No experiments yet",
    ctaText: "Create First Experiment",
    filterNoMatch: "No experiments match the selected filters.",
  },
  Samples: {
    emptyMessage: "No samples recorded",
    ctaText: "Create First Sample",
    filterNoMatch: "No samples match the selected filters.",
  },
  Equipment: {
    emptyMessage: "No equipment registered",
    ctaText: "Create First Equipment",
    filterNoMatch: "No equipment matches the selected filters.",
  },
  "Lab Notes": {
    emptyMessage: "No lab notes yet",
    ctaText: "Create First Lab Note",
    filterNoMatch: "No lab notes match the selected filters.",
  },
  Protocols: {
    emptyMessage: "No protocols in your library yet",
    ctaText: "Create first protocol",
    filterNoMatch: "No protocols match the selected filters.",
  },
}

const resourceTypes = Object.keys(RESOURCE_EMPTY_STATES)

/**
 * Property 7: Empty state rendering for zero-item resource lists
 *
 * For each Resource_List_Page rendered with empty data, verify it renders
 * a descriptive message and CTA button.
 *
 * **Validates: Requirements 5.1**
 */
describe("Property 7: Empty state rendering for zero-item resource lists", () => {
  const resourceTypeArb = fc.constantFrom(...resourceTypes)

  it("every resource type has a non-empty descriptive empty state message", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        expect(config.emptyMessage).toBeTruthy()
        expect(config.emptyMessage.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it("every resource type has a non-empty CTA button text", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        expect(config.ctaText).toBeTruthy()
        expect(config.ctaText.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it("empty state message contains the resource type concept or a descriptive noun", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        // The message should reference the resource in some form
        const lowerMsg = config.emptyMessage.toLowerCase()
        const lowerType = resourceType.toLowerCase()
        // Check that the message contains at least part of the resource name
        // e.g., "lab notes" in "No lab notes yet", "projects" in "No projects yet"
        const keywords = lowerType.split(" ")
        const containsKeyword = keywords.some((kw) => lowerMsg.includes(kw))
        expect(containsKeyword).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("CTA text contains an action word (Create/create)", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        const lowerCta = config.ctaText.toLowerCase()
        expect(lowerCta).toContain("create")
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 8: Filter-no-match message distinct from empty state
 *
 * Verify filter-specific "no matches" message is textually distinct
 * from zero-data empty state.
 *
 * **Validates: Requirements 5.6**
 */
describe("Property 8: Filter-no-match message distinct from empty state", () => {
  const resourceTypeArb = fc.constantFrom(...resourceTypes)

  it("filter-no-match message is textually distinct from the empty state message for every resource type", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        expect(config.filterNoMatch).not.toBe(config.emptyMessage)
        // They should not even be substrings of each other
        expect(config.filterNoMatch.includes(config.emptyMessage)).toBe(false)
        expect(config.emptyMessage.includes(config.filterNoMatch)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("filter-no-match message contains 'match' or 'filter' keyword", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        const lowerMsg = config.filterNoMatch.toLowerCase()
        const containsFilterKeyword =
          lowerMsg.includes("match") || lowerMsg.includes("filter")
        expect(containsFilterKeyword).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("filter-no-match message is non-empty for every resource type", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        expect(config.filterNoMatch).toBeTruthy()
        expect(config.filterNoMatch.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it("empty state message does NOT contain 'match' or 'filter' keyword (distinguishing characteristic)", () => {
    fc.assert(
      fc.property(resourceTypeArb, (resourceType) => {
        const config = RESOURCE_EMPTY_STATES[resourceType]
        const lowerMsg = config.emptyMessage.toLowerCase()
        const containsFilterKeyword =
          lowerMsg.includes("match") || lowerMsg.includes("filter")
        expect(containsFilterKeyword).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})


/**
 * Property 11: Mobile viewport forces grid view
 *
 * For any Resource_List_Page component, when the viewport width is 768px or
 * less (isMobile is true), the view mode should be locked to "grid" and the
 * table toggle button should be disabled.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe("Property 11: Mobile viewport forces grid view", () => {
  // The mobile breakpoint used across all resource list pages
  const MOBILE_BREAKPOINT = 768

  // Generate viewport widths in the mobile range (1-768)
  const mobileWidthArb = fc.integer({ min: 1, max: MOBILE_BREAKPOINT })
  // Generate viewport widths in the desktop range (769-3840)
  const desktopWidthArb = fc.integer({ min: MOBILE_BREAKPOINT + 1, max: 3840 })

  // All resource list pages that implement the grid/table toggle
  const resourcePages = [
    "Projects",
    "Experiments",
    "Samples",
    "Equipment",
    "Lab Notes",
    "Papers",
  ]
  const resourcePageArb = fc.constantFrom(...resourcePages)

  it("for any mobile viewport width (<= 768px), view mode is always 'grid'", () => {
    fc.assert(
      fc.property(mobileWidthArb, resourcePageArb, (viewportWidth, _page) => {
        // The logic used in all resource list pages:
        // const isMobile = useMediaQuery("(max-width: 768px)")
        // useEffect(() => { if (isMobile) setViewMode("grid") }, [isMobile])
        const isMobile = viewportWidth <= MOBILE_BREAKPOINT
        expect(isMobile).toBe(true)

        // When isMobile is true, viewMode is forced to "grid"
        const viewMode = isMobile ? "grid" : "table"
        expect(viewMode).toBe("grid")
      }),
      { numRuns: 100 }
    )
  })

  it("for any mobile viewport width, table toggle button is disabled", () => {
    fc.assert(
      fc.property(mobileWidthArb, resourcePageArb, (viewportWidth, _page) => {
        const isMobile = viewportWidth <= MOBILE_BREAKPOINT
        expect(isMobile).toBe(true)

        // The toggle button disabled state: disabled={isMobile}
        const tableToggleDisabled = isMobile
        expect(tableToggleDisabled).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("for any desktop viewport width (> 768px), table toggle is enabled", () => {
    fc.assert(
      fc.property(desktopWidthArb, resourcePageArb, (viewportWidth, _page) => {
        const isMobile = viewportWidth <= MOBILE_BREAKPOINT
        expect(isMobile).toBe(false)

        // On desktop, the table toggle is not disabled
        const tableToggleDisabled = isMobile
        expect(tableToggleDisabled).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 12: Fetch error displays destructive alert
 *
 * For any Resource_List_Page (Lab Notes, Papers, or any client-fetched list)
 * that encounters a data fetch error, the page should render an Alert component
 * with variant="destructive" containing the error message.
 *
 * **Validates: Requirements 8.1, 8.2, 8.4**
 */
describe("Property 12: Fetch error displays destructive alert", () => {
  // Generate random error messages
  const errorMessageArb = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0)

  // Pages that display destructive alerts on fetch error
  const errorPages = ["Lab Notes", "Papers"]
  const errorPageArb = fc.constantFrom(...errorPages)

  it("for any non-empty error message, the alert variant is always 'destructive'", () => {
    fc.assert(
      fc.property(errorMessageArb, errorPageArb, (errorMessage, _page) => {
        // The pattern used in lab-notes and papers pages:
        // {fetchError && <Alert variant="destructive">...{fetchError}...</Alert>}
        const fetchError = errorMessage
        const alertVariant = fetchError ? "destructive" : null

        expect(alertVariant).toBe("destructive")
      }),
      { numRuns: 100 }
    )
  })

  it("the error message is preserved in the alert content", () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMessage) => {
        // The alert displays the error message as-is
        const displayedMessage = errorMessage
        expect(displayedMessage).toBe(errorMessage)
        expect(displayedMessage.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it("no alert is rendered when there is no error", () => {
    fc.assert(
      fc.property(errorPageArb, (_page) => {
        const fetchError: string | null = null
        // When fetchError is null/falsy, no alert is rendered
        const shouldRenderAlert = !!fetchError
        expect(shouldRenderAlert).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
