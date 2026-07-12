"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Notes9LoaderVariant, Notes9VideoLoader } from "@/components/brand/notes9-video-loader"

export const MIN_LOADER_DURATION_MS = 350
export const MAX_LOADER_DURATION_MS = 8000
export const AUTH_MAX_LOADER_DURATION_MS = 12000

const RESEARCH_FUN_FACTS = [
  "Mascot is filing your notes before the coffee cools.",
  "Untangling a small ball of citations. Almost there.",
  "Catching the page before it scrolls away.",
  "Persuading the database to share its secrets.",
  "Counting pipettes so you don't have to.",
  "Bribing the loading bar with a fresh dataset.",
  "Sharpening pencils and aligning footnotes.",
  "Lightly dusting the experiment notebook.",
]

export function extractPathname(href: string): string {
  return href.split("?")[0]?.split("#")[0] || href
}

export function isSamePage(href: string, currentPathname: string): boolean {
  const hrefPathname = extractPathname(href)
  return hrefPathname === currentPathname
}

export function isMarketingPath(path: string | null | undefined) {
  if (!path) return false
  if (path === "/") return true
  return (
    path.startsWith("/about") ||
    path.startsWith("/platform") ||
    path.startsWith("/pricing") ||
    path.startsWith("/resources") ||
    path.startsWith("/docs") ||
    path.startsWith("/marketing") ||
    path.startsWith("/privacy") ||
    path.startsWith("/terms")
  )
}

function getActionLabel(target: HTMLElement) {
  const source = target.closest("a,button") as HTMLElement | null
  const rawLabel =
    source?.getAttribute("aria-label") ||
    source?.getAttribute("title") ||
    source?.textContent ||
    ""

  return rawLabel.replace(/\s+/g, " ").trim()
}

/** Destination-path → loader variant, most specific first. Matching is STRICT
 * on the pathname: the query string is never consulted (sidebar links carry
 * `?project=<id>`, which used to fuzzy-match every section to the "projects"
 * loader). `/data` shows the experiments loader — data lives inside an
 * experiment tab and the route redirects there. */
const PATH_VARIANTS: ReadonlyArray<readonly [string, Notes9LoaderVariant]> = [
  ["/research-map", "research-map"],
  ["/protocols", "protocols"],
  ["/literature-reviews", "literature"],
  ["/papers", "writing"],
  ["/experiments", "experiments"],
  ["/data", "data"],
  ["/lab-notes", "notes"],
  ["/samples", "samples"],
  ["/equipment", "equipment"],
  ["/projects", "projects"],
  ["/search", "search"],
]

function variantFromPath(path: string): Notes9LoaderVariant | null {
  for (const [prefix, variant] of PATH_VARIANTS) {
    if (path === prefix || path.startsWith(prefix + "/")) return variant
  }
  return null
}

function inferLoaderVariant(actionLabel: string, href?: string | null): Notes9LoaderVariant {
  // The destination path is what the user actually selected — it wins.
  if (href) {
    const fromPath = variantFromPath(extractPathname(href))
    if (fromPath) return fromPath
  }
  // Label keywords only as a fallback for hrefless triggers (buttons, custom
  // navigation events with no path).
  const source = actionLabel.toLowerCase()
  if (source.includes("research map")) return "research-map"
  if (source.includes("protocol")) return "protocols"
  if (source.includes("literature") || source.includes("book")) return "literature"
  if (source.includes("writing") || source.includes("paper")) return "writing"
  if (source.includes("search")) return "search"
  if (source.includes("experiment")) return "experiments"
  if (source.includes("data")) return "data"
  if (source.includes("sample")) return "samples"
  if (source.includes("equipment") || source.includes("microscope")) return "equipment"
  if (source.includes("note")) return "notes"
  if (source.includes("project")) return "projects"
  return "default"
}

function buildLoaderCopy(actionLabel: string, variant: Notes9LoaderVariant) {
  const variantTitle =
    variant === "literature"
      ? "Opening Literature"
      : variant === "writing"
        ? "Opening Writing"
      : variant === "auth"
        ? "Opening Sign In"
      : variant === "search"
        ? "Running Search"
        : variant === "projects"
          ? "Opening Projects"
          : variant === "experiments"
            ? "Opening Experiments"
            : variant === "data"
            ? "Opening Data"
            : variant === "samples"
            ? "Opening Samples"
              : variant === "equipment"
                ? "Opening Equipment"
                : variant === "research-map"
                  ? "Opening Research Map"
                  : variant === "protocols"
                    ? "Opening Protocols"
                    : variant === "notes"
                      ? "Opening Lab Notes"
                      : "Loading Notes9"

  const variantCaptions =
    variant === "literature"
      ? [
          "Mascot is stacking papers into a precarious tower.",
          "Skimming abstracts at lightning speed (well, almost).",
          "Borrowing one more book from the library.",
        ]
      : variant === "writing"
        ? [
            "Sharpening pencils, dusting the writing desk.",
            "Negotiating with the blank page.",
            "Plotting your next great paragraph.",
          ]
      : variant === "auth"
        ? [
            "Polishing the workspace before you walk in.",
            "Unrolling the welcome mat.",
            "Pouring a fresh cup before the doors open.",
          ]
      : variant === "search"
        ? [
            "Magnifying glass deployed. Standing by.",
            "Checking every drawer for the right paper.",
            "Reading minds is hard. Reading indexes is faster.",
          ]
        : variant === "projects"
          ? [
              "Stacking project folders into a tidy pile.",
              "Naming files because the hard part is naming things.",
              "Calibrating Gantt chart energy.",
            ]
          : variant === "experiments"
          ? [
              "Pipettes uncapped. Test tubes in formation.",
              "Reviewing your last brilliant hypothesis.",
              "Whispering encouragement to the bench.",
            ]
          : variant === "data"
            ? [
                "Lining up datasets row by row.",
                "Warming up the plots and readouts.",
                "Fetching files fresh from the instrument.",
              ]
          : variant === "samples"
            ? [
                "Sample tubes spinning into place.",
                "Counting freezer racks one more time.",
                "Labels straight, lids tight.",
              ]
            : variant === "equipment"
              ? [
                  "Tuning the microscope to your favorite focus.",
                  "Plugging in the spectrometer one cable at a time.",
                  "Asking the centrifuge nicely to behave today.",
                ]
              : variant === "research-map"
                ? [
                    "Connecting the dots between everything you've built.",
                    "Drawing arrows the satisfying way.",
                    "Mapping protocols → papers → results.",
                  ]
                : variant === "protocols"
                  ? [
                      "Steps in order, units double-checked.",
                      "Translating wet-lab to dry-text.",
                      "Hiding the ambiguities under reproducible methods.",
                    ]
                  : variant === "notes"
                    ? [
                        "Opening the lab notebook to a fresh page.",
                        "Catching observations before they escape.",
                        "Stitching today's results into the bigger story.",
                      ]
                    : RESEARCH_FUN_FACTS

  if (!actionLabel) {
    return {
      title: variantTitle,
      captions: variantCaptions,
    }
  }

  return {
    title: actionLabel.toLowerCase().startsWith("open") ? actionLabel : `${variantTitle}${variant === "default" ? `: ${actionLabel}` : ""}`,
    captions: [
      ...variantCaptions,
      `Preparing ${actionLabel}.`,
      "Tidying the interface before it lands.",
    ],
  }
}

function triggerLoader(
  actionLabel: string,
  variant: Notes9LoaderVariant,
  setLoaderTitle: (value: string) => void,
  setLoaderCaptions: (value: string[]) => void,
  setLoaderVariant: (value: Notes9LoaderVariant) => void,
  setIsLoading: (value: boolean) => void,
  setLoadingStartedAt: (value: number | null) => void,
) {
  const { title, captions } = buildLoaderCopy(actionLabel, variant)
  setLoaderTitle(title)
  setLoaderCaptions(captions)
  setLoaderVariant(variant)
  setIsLoading(true)
  setLoadingStartedAt(Date.now())
}

export function NavigationLoader() {
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loaderTitle, setLoaderTitle] = useState("Loading Notes9")
  const [loaderVariant, setLoaderVariant] = useState<Notes9LoaderVariant>("default")
  const [loaderCaptions, setLoaderCaptions] = useState<string[]>([
    "Loading your next view.",
  ])
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null)
  const destinationPathRef = useRef<string | null>(null)
  // Pathname at trigger time — when no destination is known (custom events),
  // we settle only after we've actually LEFT this path.
  const originPathRef = useRef<string | null>(null)
  const pathname = usePathname()

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isLoading || loadingStartedAt == null) return

    // Settle = hand off from the mascot overlay to the destination's
    // loading.tsx skeleton, which has already committed beneath us (that's
    // what flipped the pathname). The overlay is deliberately the SHORT
    // phase — the route skeleton owns the rest of the wait while data
    // streams, so the skeleton always shows longer than the overlay.
    const destination = destinationPathRef.current
    const origin = originPathRef.current

    // Still on the page the user clicked from → route not committed yet.
    if (origin != null && pathname === origin) return

    // Redirect chains (e.g. /data → /experiments?project=…) never reach the
    // recorded destination. Once we've LEFT the origin, treat a path that
    // stays stable through a short grace window as the real destination —
    // this effect re-runs (and cancels the timer) on every pathname hop, so
    // an intermediate route never dismisses the overlay early. Previously the
    // overlay waited for the unreachable destination until the 8s safety
    // timeout fired.
    const reachedDestination = destination == null || pathname === destination
    const redirectGraceMs = reachedDestination ? 0 : 450

    const elapsed = Date.now() - loadingStartedAt
    const remaining = Math.max(redirectGraceMs, MIN_LOADER_DURATION_MS - elapsed)
    let raf1 = 0
    let raf2 = 0
    const timeoutId = window.setTimeout(() => {
      // Two rAFs = the new route has committed AND painted beneath the
      // overlay, so removing it can never reveal a stale frame of the old page.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setIsLoading(false)
          setLoadingStartedAt(null)
          destinationPathRef.current = null
          originPathRef.current = null
        })
      })
    }, remaining)

    return () => {
      window.clearTimeout(timeoutId)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [pathname, isLoading, loadingStartedAt])

  useEffect(() => {
    if (!mounted) return

    let timeoutId: NodeJS.Timeout | null = null
    const startSafetyTimeout = (variant: Notes9LoaderVariant) => {
      timeoutId = setTimeout(() => {
        console.warn(`[NavigationLoader] Safety timeout fired for route: ${destinationPathRef.current}`)
        setIsLoading(false)
        setLoadingStartedAt(null)
      }, variant === "auth" ? AUTH_MAX_LOADER_DURATION_MS : MAX_LOADER_DURATION_MS)
    }

    // Intercept all clicks to detect navigation
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      
      // Check if it's a link or inside a link
      const link = target.closest("a")
      if (link) {
        const href = link.getAttribute("href")
        const targetAttr = link.getAttribute("target")
        
        // Only show loader for internal navigation (not external links or new tabs)
        if (href && href.startsWith("/") && targetAttr !== "_blank") {
          const destinationPath = extractPathname(href)
          if (isMarketingPath(pathname) && isMarketingPath(destinationPath)) {
            return
          }
          if (href === "/auth/login" || href.startsWith("/auth/login?")) {
            return
          }
          // Don't show loader if clicking the current page or hash links
          const samePage = isSamePage(href, pathname ?? "")
          const isHashLink = href.startsWith("/#") || href.includes("#")
          
          if (!samePage && !isHashLink) {
            destinationPathRef.current = destinationPath
            originPathRef.current = pathname
            const label = getActionLabel(target)
            const variant = inferLoaderVariant(label, href)
            triggerLoader(label, variant, setLoaderTitle, setLoaderCaptions, setLoaderVariant, setIsLoading, setLoadingStartedAt)
            startSafetyTimeout(variant)
          }
        }
        return
      }

      // Check if it's a button that might navigate
      const button = target.closest("button")
      if (button) {
        // Look for data attribute that indicates navigation
        if (button.hasAttribute("data-navigate")) {
          destinationPathRef.current = null
          originPathRef.current = pathname
          const label = getActionLabel(target)
          const variant = inferLoaderVariant(label)
          triggerLoader(label, variant, setLoaderTitle, setLoaderCaptions, setLoaderVariant, setIsLoading, setLoadingStartedAt)
          startSafetyTimeout(variant)
        }
      }
    }

    const handleCustomNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string; href?: string; kind?: Notes9LoaderVariant }>).detail
      const label = detail?.label ?? ""
      destinationPathRef.current = detail?.href ? extractPathname(detail.href) : null
      originPathRef.current = pathname
      const variant = detail?.kind ?? inferLoaderVariant(label, detail?.href)
      triggerLoader(label, variant, setLoaderTitle, setLoaderCaptions, setLoaderVariant, setIsLoading, setLoadingStartedAt)
      startSafetyTimeout(variant)
    }

    document.addEventListener("click", handleClick, true)
    window.addEventListener("notes9:navigation-start", handleCustomNavigation as EventListener)

    return () => {
      document.removeEventListener("click", handleClick, true)
      window.removeEventListener("notes9:navigation-start", handleCustomNavigation as EventListener)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [pathname, mounted])

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!mounted || !isLoading) return null

  return (
    <>
      <div className="fixed inset-0 z-[9998] pointer-events-none animate-in fade-in duration-300">
        <div className="absolute inset-0 bg-background" />
      </div>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none animate-in fade-in duration-300">
        <div className="-translate-y-8 sm:-translate-y-10">
          {loaderVariant === "auth" ? (
            <Notes9VideoLoader
              compact
              size="sm"
              variant="default"
              title={loaderTitle}
              captions={[]}
              label={loaderTitle}
            />
          ) : (
            <Notes9VideoLoader
              compact
              size="sm"
              variant={loaderVariant}
              title={loaderTitle}
              captions={loaderCaptions}
              label={loaderTitle}
            />
          )}
        </div>
      </div>
    </>
  )
}
