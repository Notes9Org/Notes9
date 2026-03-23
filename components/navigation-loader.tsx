"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Notes9LoaderVariant, Notes9VideoLoader } from "@/components/brand/notes9-video-loader"

const MIN_LOADER_DURATION_MS = 350
const MAX_LOADER_DURATION_MS = 8000
const AUTH_MAX_LOADER_DURATION_MS = 12000

const RESEARCH_FUN_FACTS = [
  "Researchers often spend more time finding prior context than rewriting the final paragraph.",
  "Well-linked notes reduce repeat experiment setup because the rationale stays attached to the protocol.",
  "A searchable lab memory can cut handoff friction when projects move between scientists.",
  "Most literature reviews improve when claims, source files, and experiment outcomes stay connected.",
  "Teams lose less knowledge over time when decisions are captured near the data that triggered them.",
  "Small documentation gaps compound quickly in long-running research programs.",
  "Structured experiment notes make retrospective analysis faster because assumptions stay visible.",
  "Literature retrieval gets easier when keywords, methods, and findings are stored in one workflow.",
]

function isMarketingPath(path: string | null | undefined) {
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

function inferLoaderVariant(actionLabel: string, href?: string | null): Notes9LoaderVariant {
  const source = `${href ?? ""} ${actionLabel}`.toLowerCase()
  if (source.includes("/research-map") || source.includes("research map")) return "research-map"
  if (source.includes("protocol")) return "protocols"
  if (source.includes("literature") || source.includes("paper") || source.includes("book")) return "literature"
  if (source.includes("search")) return "search"
  if (source.includes("/projects") || source.includes("project")) return "projects"
  if (source.includes("/experiments") || source.includes("experiment")) return "experiments"
  if (source.includes("/samples") || source.includes("sample")) return "samples"
  if (source.includes("/equipment") || source.includes("equipment") || source.includes("microscope")) return "equipment"
  if (source.includes("/lab-notes") || source.includes("note")) return "notes"
  return "default"
}

function buildLoaderCopy(actionLabel: string, variant: Notes9LoaderVariant) {
  const variantTitle =
    variant === "literature"
      ? "Opening Literature"
      : variant === "auth"
        ? "Opening Sign In"
      : variant === "search"
        ? "Running Search"
        : variant === "projects"
          ? "Opening Projects"
          : variant === "experiments"
            ? "Opening Experiments"
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
          "Mascot is scanning books and surfacing the strongest sources.",
          "Context improves when evidence stays linked to the work.",
          "Structured literature review reduces repeated searching later.",
        ]
      : variant === "auth"
        ? [
            "Mascot is preparing your secure workspace access.",
            "Opening the sign in flow and loading your research environment.",
            "Getting Notes9 ready before you enter the workspace.",
          ]
      : variant === "search"
        ? [
            "Mascot is sweeping the workspace with a magnifying glass.",
            "Fast retrieval matters when experiments depend on prior context.",
            "Good search reduces time lost to context switching.",
          ]
        : variant === "projects"
          ? [
              "Mascot is stacking the project floor one layer at a time.",
              "Clear project structure keeps experiments and notes connected.",
              "Hierarchy helps research teams see status without hunting for it.",
            ]
          : variant === "experiments"
          ? [
              "Mascot is setting up a pipette and test tube for the experiment view.",
              "Experiment continuity improves when notes, files, and protocol stay together.",
              "Execution moves faster when setup details remain attached to the run.",
            ]
          : variant === "samples"
            ? [
                "Mascot is cycling sample tubes into view for the inventory.",
                "Sample traceability improves when material context stays attached to each record.",
                "Consistent sample tracking reduces ambiguity across experiments and reviews.",
              ]
            : variant === "equipment"
              ? [
                  "Mascot is lining up the microscope for the equipment view.",
                  "Instrument visibility improves when status, location, and history stay connected.",
                  "Equipment context helps teams plan runs without checking multiple systems.",
                ]
              : variant === "research-map"
                ? [
                    "Mascot is tracing the links between your projects, experiments, protocols, and papers.",
                    "Research maps are most useful when the connections stay visible, not just the individual records.",
                    "Linked entities make it easier to follow how evidence and execution fit together.",
                  ]
                : variant === "protocols"
                  ? [
                      "Mascot is writing protocol steps beside the notebook.",
                      "Protocol clarity reduces ambiguity before experiments begin.",
                      "Well-defined methods make repeats more reliable.",
                    ]
                  : variant === "notes"
                    ? [
                        "Mascot is opening the lab notebook and setting the page.",
                        "Well-kept notes preserve rationale, not just results.",
                        "Documentation is most useful when it stays close to execution.",
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
  const pathname = usePathname()

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isLoading || loadingStartedAt == null) return

    const elapsed = Date.now() - loadingStartedAt
    const remaining = Math.max(0, MIN_LOADER_DURATION_MS - elapsed)
    const timeoutId = window.setTimeout(() => {
      setIsLoading(false)
      setLoadingStartedAt(null)
    }, remaining)

    return () => window.clearTimeout(timeoutId)
  }, [pathname])

  useEffect(() => {
    if (!mounted) return

    let timeoutId: NodeJS.Timeout | null = null
    const startSafetyTimeout = (variant: Notes9LoaderVariant) => {
      timeoutId = setTimeout(() => {
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
          const destinationPath = href.split("?")[0]?.split("#")[0] || href
          if (isMarketingPath(pathname) && isMarketingPath(destinationPath)) {
            return
          }
          if (href === "/auth/login" || href.startsWith("/auth/login?")) {
            return
          }
          // Don't show loader if clicking the current page or hash links
          const isSamePage = href === pathname || href.split("?")[0] === pathname
          const isHashLink = href.startsWith("/#") || href.includes("#")
          
          if (!isSamePage && !isHashLink) {
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
    </>
  )
}
