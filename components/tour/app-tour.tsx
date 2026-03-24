"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { driver, type Driver, type PopoverDOM, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"
import { createClient } from "@/lib/supabase/client"

type TourStatus = "completed" | "skipped"

const TOUR_COMPLETED_KEY = "notes9_tour_completed"
const TOUR_SKIPPED_KEY = "notes9_tour_skipped"

/** Dispatch with `detail.pathname` (e.g. from `usePathname()`) for a short, page-specific tour. */
export const NOTES9_PAGE_HELP_EVENT = "notes9:page-help"

export type PageHelpEventDetail = { pathname: string }

export function requestPageHelp(pathname: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<PageHelpEventDetail>(NOTES9_PAGE_HELP_EVENT, {
      detail: { pathname: pathname || "/dashboard" },
    })
  )
}

const waitForElement = async (selector: string, timeoutMs = 6000) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (document.querySelector(selector)) {
      return true
    }

    await new Promise((resolve) => window.setTimeout(resolve, 120))
  }

  return false
}

type MascotRenderer = (htmlContent: string) => string

function normalizeAppPath(pathname: string): string {
  const raw = (pathname || "/dashboard").trim()
  const noQuery = raw.split("?")[0] || "/dashboard"
  const trimmed = noQuery.length > 1 ? noQuery.replace(/\/$/, "") : noQuery
  return trimmed || "/dashboard"
}

function buildContextualTourSteps(
  pathname: string,
  renderMascot: MascotRenderer,
  onDone: () => void
): DriveStep[] {
  const path = normalizeAppPath(pathname)

  const intro = (title: string, body: string): DriveStep => ({
    popover: {
      title,
      description: renderMascot(body),
      side: "top",
      align: "center",
      nextBtnText: "Next",
    },
  })

  const navTo = (href: string, title: string, body: string, doneAfter: boolean): DriveStep => ({
    element: `a[href='${href}']`,
    popover: {
      title,
      description: renderMascot(body),
      side: "right",
      align: "center",
      ...(doneAfter
        ? {
            doneBtnText: "Done" as const,
            onNextClick: () => {
              onDone()
            },
          }
        : {}),
    },
  })

  const spot = (
    selector: string,
    title: string,
    body: string,
    options: { side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; last?: boolean }
  ): DriveStep => ({
    element: selector,
    popover: {
      title,
      description: renderMascot(body),
      side: options.side ?? "right",
      align: options.align ?? "center",
      ...(options.last
        ? {
            doneBtnText: "Done" as const,
            onNextClick: () => {
              onDone()
            },
          }
        : {}),
    },
  })

  const outro = (title: string, body: string): DriveStep => ({
    popover: {
      title,
      description: renderMascot(body),
      side: "top",
      align: "center",
      doneBtnText: "Done",
      onNextClick: () => {
        onDone()
      },
    },
  })

  if (path.startsWith("/projects")) {
    if (path === "/projects") {
      return [
        intro(
          "Projects",
          "Projects are the top-level containers for each research effort. They group experiments, collaborators, and timelines in one place."
        ),
        navTo(
          "/projects",
          "Projects in the sidebar",
          "Use this link anytime to return to your full project list.",
          false
        ),
        spot(
          "#tour-create-project",
          "Create a project",
          "Tap the plus to start a new project. Once it exists, you can attach experiments, notes, and team members.",
          { side: "bottom", align: "end", last: true }
        ),
      ]
    }
    return [
      intro(
        "Projects",
        "You are inside a single project. The sidebar still gives you quick access to the rest of your workspace."
      ),
      navTo(
        "/projects",
        "Back to all projects",
        "Open the project list whenever you want to switch context or create another study.",
        true
      ),
    ]
  }

  if (path.startsWith("/experiments")) {
    if (path === "/experiments") {
      return [
        intro(
          "Experiments",
          "Experiments capture specific procedures and study runs inside a project. Keeping them organized makes protocols, samples, and notes easier to find."
        ),
        navTo(
          "/experiments",
          "Experiments in the sidebar",
          "Jump back here from anywhere to see every experiment at a glance.",
          false
        ),
        spot(
          "#tour-create-experiment",
          "Create an experiment",
          "Use the plus after you have a project. Each experiment can link to lab notes, protocols, samples, and equipment usage.",
          { side: "bottom", align: "end", last: true }
        ),
      ]
    }
    return [
      intro(
        "Experiments",
        "You are viewing one experiment. Use the sidebar when you need the full list or another area of Notes9."
      ),
      navTo("/experiments", "Experiment list", "Return to all experiments from this link.", true),
    ]
  }

  if (path.startsWith("/lab-notes")) {
    return [
      intro(
        "Lab Notes",
        "Lab notes are where daily observations, methods, and results live alongside comments and linked materials."
      ),
      navTo(
        "/lab-notes",
        "Lab Notes in the sidebar",
        "Open this section whenever you want to browse or start new notebook entries.",
        true
      ),
    ]
  }

  if (path.startsWith("/samples")) {
    return [
      intro(
        "Samples",
        "Track tubes, plates, aliquots, and other materials with codes, storage, and links to experiments."
      ),
      navTo("/samples", "Samples in the sidebar", "Return to inventory and filters from here.", true),
    ]
  }

  if (path.startsWith("/equipment")) {
    return [
      intro(
        "Equipment",
        "Register instruments, maintenance dates, and locations so the lab knows what is available and where."
      ),
      navTo("/equipment", "Equipment in the sidebar", "Switch back to the equipment list from any page.", true),
    ]
  }

  if (path.startsWith("/protocols")) {
    return [
      intro(
        "Protocols",
        "Protocols store repeatable SOP-style steps so experiments stay consistent instead of rewriting the same process."
      ),
      navTo("/protocols", "Protocols in the sidebar", "Browse and manage your protocol library from here.", true),
    ]
  }

  if (path.startsWith("/literature-reviews")) {
    return [
      intro(
        "Literature",
        "Collect papers, read PDFs, and keep citations tied to the projects and experiments they support."
      ),
      navTo(
        "/literature-reviews",
        "Literature in the sidebar",
        "Jump back to your reference library whenever you need it.",
        true
      ),
    ]
  }

  if (path.startsWith("/research-map")) {
    return [
      intro(
        "Research map",
        "Visualize how projects, experiments, and notes connect so the big picture stays clear as work grows."
      ),
      navTo(
        "/research-map",
        "Research map in the sidebar",
        "Reopen the map from the sidebar when you want another look.",
        true
      ),
    ]
  }

  if (path.startsWith("/settings")) {
    return [
      intro(
        "Account settings",
        "Manage your profile, preferences, and how Notes9 behaves for your account."
      ),
      outro(
        "Quick tip",
        "You can open Account Settings again from the user menu at the bottom of the sidebar."
      ),
    ]
  }

  if (path.startsWith("/catalyst")) {
    return [
      intro("Catalyst", "Work with Catalyst from this area while the rest of your workspace stays one click away in the sidebar."),
      spot(
        "#tour-main-nav",
        "Main navigation",
        "Use the sidebar to move between dashboard, projects, experiments, and the rest of your lab workflow.",
        { side: "right", align: "start", last: true }
      ),
    ]
  }

  if (path.startsWith("/reports")) {
    return [
      intro(
        "Reports",
        "Generate and review summaries that pull from your projects and experiments. Use the sidebar to move on when you are done."
      ),
      spot(
        "#tour-main-nav",
        "Workspace navigation",
        "Switch to projects, experiments, lab notes, and the rest of your workflow from here.",
        { side: "right", align: "start", last: true }
      ),
    ]
  }

  if (path === "/dashboard" || path === "/") {
    return [
      intro(
        "Dashboard",
        "Your home view surfaces activity and shortcuts so you can pick up where you left off."
      ),
      spot(
        "#tour-main-nav",
        "Workspace navigation",
        "Move between dashboard, projects, experiments, lab notes, inventory, protocols, and literature.",
        { side: "right", align: "start" }
      ),
      spot(
        "#tour-search",
        "Search",
        "Search across projects, experiments, notes, and more without leaving your current page.",
        { side: "right", align: "start", last: true }
      ),
    ]
  }

  return [
    intro(
      "This workspace",
      "Notes9 groups your work into projects and experiments, with lab notes, inventory, protocols, and literature alongside."
    ),
    spot(
      "#tour-main-nav",
      "Main navigation",
      "Use the sidebar to switch areas. The help button always starts a short tour for the page you have open.",
      { side: "right", align: "start", last: true }
    ),
  ]
}

export function AppTour() {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const driverRef = useRef<Driver | null>(null)
  const dismissalStatusRef = useRef<TourStatus | null>(null)
  const persistenceInFlightRef = useRef(false)
  const suppressDestroyPersistenceRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    let cancelled = false
    const pendingStartTimerRef = { current: null as number | null }
    let tourGeneration = 0
    const supabase = createClient()
    suppressDestroyPersistenceRef.current = false

    const clearPendingStart = () => {
      if (pendingStartTimerRef.current !== null) {
        window.clearTimeout(pendingStartTimerRef.current)
        pendingStartTimerRef.current = null
      }
    }

    const renderMascot = (htmlContent: string) => `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-top:8px;">
        <img src="/notes9-mascot-ui.png" class="tour-mascot-animate" alt="Notes9 Mascot" style="width:52px;height:52px;object-fit:contain;flex-shrink:0;border-radius:50%;" />
        <div style="font-size:14px;line-height:1.45;">${htmlContent}</div>
      </div>
    `

    const persistTourStatus = async (userId: string, status: TourStatus) => {
      if (persistenceInFlightRef.current) return
      persistenceInFlightRef.current = true

      const timestamp = new Date().toISOString()
      const updates =
        status === "completed"
          ? { notes9_tour_completed_at: timestamp }
          : { notes9_tour_skipped_at: timestamp }

      try {
        await supabase.from("profiles").update(updates).eq("id", userId)
      } finally {
        persistenceInFlightRef.current = false
      }
    }

    const finalizeTour = async (userId: string, status: TourStatus) => {
      dismissalStatusRef.current = status

      if (status === "completed") {
        localStorage.setItem(TOUR_COMPLETED_KEY, "true")
        localStorage.removeItem(TOUR_SKIPPED_KEY)
      } else {
        localStorage.setItem(TOUR_SKIPPED_KEY, "true")
      }

      await persistTourStatus(userId, status)
      driverRef.current?.destroy()
    }

    const navigateAndAdvance = async (href: string, selector: string) => {
      router.push(href)
      const found = await waitForElement(selector)
      if (cancelled) return

      if (found) {
        driverRef.current?.moveNext()
        window.requestAnimationFrame(() => driverRef.current?.refresh())
        return
      }

      driverRef.current?.moveNext()
    }

    const injectSkipButton = (popover: PopoverDOM, userId: string) => {
      const footerButtons = popover.footerButtons
      if (!footerButtons || footerButtons.querySelector("[data-tour-skip-button='true']")) return

      const skipButton = document.createElement("button")
      skipButton.type = "button"
      skipButton.dataset.tourSkipButton = "true"
      skipButton.textContent = "Skip tour"
      skipButton.className = "driver-popover-btn"
      skipButton.style.marginRight = "auto"
      skipButton.style.marginLeft = "12px"
      skipButton.style.opacity = "0.85"
      skipButton.style.minHeight = "36px"
      skipButton.style.padding = "0 14px"
      skipButton.style.display = "inline-flex"
      skipButton.style.alignItems = "center"
      skipButton.onclick = () => {
        void finalizeTour(userId, "skipped")
      }
      footerButtons.prepend(skipButton)
    }

    const injectContextCloseButton = (popover: PopoverDOM) => {
      const footerButtons = popover.footerButtons
      if (!footerButtons || footerButtons.querySelector("[data-tour-context-close='true']")) return

      const closeButton = document.createElement("button")
      closeButton.type = "button"
      closeButton.dataset.tourContextClose = "true"
      closeButton.textContent = "Close"
      closeButton.className = "driver-popover-btn"
      closeButton.style.marginRight = "auto"
      closeButton.style.marginLeft = "12px"
      closeButton.style.opacity = "0.85"
      closeButton.style.minHeight = "36px"
      closeButton.style.padding = "0 14px"
      closeButton.style.display = "inline-flex"
      closeButton.style.alignItems = "center"
      closeButton.onclick = () => {
        suppressDestroyPersistenceRef.current = true
        driverRef.current?.destroy()
        driverRef.current = null
        suppressDestroyPersistenceRef.current = false
      }
      footerButtons.prepend(closeButton)
    }

    const destroyContextualTour = () => {
      suppressDestroyPersistenceRef.current = true
      driverRef.current?.destroy()
      driverRef.current = null
      suppressDestroyPersistenceRef.current = false
    }

    const onboardingSteps = (userId: string): DriveStep[] => [
      {
        popover: {
          title: "Welcome to Notes9",
          description: renderMascot(
            "This quick onboarding tour shows you the core research flow: start with a project, add experiments inside it, capture notes, and use the AI sidebar without losing context."
          ),
          side: "top",
          align: "center",
          nextBtnText: "Start tour",
        },
      },
      {
        element: "#tour-main-nav",
        popover: {
          title: "Your research workspace",
          description: renderMascot(
            "The left navigation follows the structure of a real lab workflow. You will usually move from <b>Projects</b> to <b>Experiments</b>, then into <b>Lab Notes</b>, protocols, inventory, and literature."
          ),
          side: "right",
          align: "start",
        },
      },
      {
        element: "a[href='/projects']",
        popover: {
          title: "Projects come first",
          description: renderMascot(
            "Projects are the top-level containers for each research effort. Create one first so Notes9 has a home for the experiments and notes that follow."
          ),
          side: "right",
          align: "center",
          onNextClick: () => {
            void navigateAndAdvance("/projects", "#tour-create-project")
          },
        },
      },
      {
        element: "#tour-create-project",
        popover: {
          title: "Create a project here",
          description: renderMascot(
            "This is the entry point for a new project. Once a project exists, you can organize experiments, assign collaborators, and keep the whole study grouped together."
          ),
          side: "bottom",
          align: "end",
          onNextClick: () => {
            void navigateAndAdvance("/experiments", "a[href='/experiments']")
          },
        },
      },
      {
        element: "a[href='/experiments']",
        popover: {
          title: "Experiments live inside projects",
          description: renderMascot(
            "Experiments capture the specific procedures and study runs inside a project. Notes9 keeps them linked so your structure stays clear as the work grows."
          ),
          side: "right",
          align: "center",
        },
      },
      {
        element: "#tour-create-experiment",
        popover: {
          title: "Create an experiment here",
          description: renderMascot(
            "Use this button after your project exists. Each experiment can then connect to protocols, samples, equipment usage, and lab notes."
          ),
          side: "bottom",
          align: "end",
        },
      },
      {
        element: "a[href='/lab-notes']",
        popover: {
          title: "Capture the work in lab notes",
          description: renderMascot(
            "Lab Notes are where your daily observations, inline comments, linked protocols, and AI-assisted writing come together during active research."
          ),
          side: "right",
          align: "center",
        },
      },
      {
        element: "a[href='/protocols']",
        popover: {
          title: "Reuse protocols across studies",
          description: renderMascot(
            "Protocols hold your repeatable SOP-style steps so experiments can stay standardized instead of rewriting the same process each time."
          ),
          side: "right",
          align: "center",
        },
      },
      {
        element: "a[href='/literature-reviews']",
        popover: {
          title: "Keep literature close to the work",
          description: renderMascot(
            "The literature area helps you collect papers, read PDFs, and connect evidence directly back into your Notes9 workflow."
          ),
          side: "right",
          align: "center",
        },
      },
      {
        element: "#tour-search",
        popover: {
          title: "Search across the workspace",
          description: renderMascot(
            "Global search lets you jump quickly to projects, experiments, notes, and inventory from anywhere in the app."
          ),
          side: "right",
          align: "start",
        },
      },
      {
        element: "#tour-ai-chat",
        onHighlightStarted: () => {
          window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))
        },
        popover: {
          title: "Your AI sidebar stays open during onboarding",
          description: renderMascot(
            "The AI assistant is already open for your first tour so you can see where to ask questions, attach context, and get help without losing your place."
          ),
          side: "left",
          align: "end",
        },
      },
      {
        element: "#tour-ai-mode",
        onHighlightStarted: () => {
          window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))
        },
        popover: {
          title: "Choose the right AI mode",
          description: renderMascot(
            "Use <b>General</b> for broad research help and web-aware tasks. Switch to <b>Notes9</b> when you want the assistant to stay grounded in your workspace context and uploaded materials."
          ),
          side: "top",
          align: "start",
        },
      },
      {
        element: "#tour-theme-toggle",
        popover: {
          title: "You are ready to work",
          description: renderMascot(
            "That is the core workflow: create a project, add experiments, document the work, and use the AI sidebar to stay productive. You can switch themes here any time."
          ),
          side: "bottom",
          align: "end",
          doneBtnText: "Finish tour",
          onNextClick: () => {
            void finalizeTour(userId, "completed")
          },
        },
      },
    ]

    const runOnboardingTour = async () => {
      clearPendingStart()
      const myGeneration = ++tourGeneration

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || cancelled || tourGeneration !== myGeneration) return

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("notes9_tour_completed_at, notes9_tour_skipped_at")
        .eq("id", user.id)
        .single()

      const shouldSuppressTour =
        (!error && Boolean(profile?.notes9_tour_completed_at || profile?.notes9_tour_skipped_at)) ||
        localStorage.getItem(TOUR_COMPLETED_KEY) === "true" ||
        localStorage.getItem(TOUR_SKIPPED_KEY) === "true"

      if (shouldSuppressTour || cancelled || tourGeneration !== myGeneration) return

      suppressDestroyPersistenceRef.current = true
      driverRef.current?.destroy()
      driverRef.current = null
      suppressDestroyPersistenceRef.current = false
      dismissalStatusRef.current = null

      window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))

      const driverObj = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        showButtons: ["next", "previous"],
        allowClose: false,
        overlayOpacity: 0.65,
        popoverClass: "driverjs-theme-researcher",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish tour",
        onPopoverRender: (popover) => injectSkipButton(popover, user.id),
        onDestroyStarted: () => {
          if (suppressDestroyPersistenceRef.current) return
          if (dismissalStatusRef.current) return
          dismissalStatusRef.current = "skipped"
          localStorage.setItem(TOUR_SKIPPED_KEY, "true")
          void persistTourStatus(user.id, "skipped")
        },
        steps: onboardingSteps(user.id),
      })

      driverRef.current = driverObj

      const delayMs = 900
      pendingStartTimerRef.current = window.setTimeout(() => {
        pendingStartTimerRef.current = null
        if (!cancelled && tourGeneration === myGeneration) {
          driverObj.drive()
        }
      }, delayMs)
    }

    const runContextualPageHelp = async (pathname: string) => {
      clearPendingStart()
      const myGeneration = ++tourGeneration

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || cancelled || tourGeneration !== myGeneration) return

      suppressDestroyPersistenceRef.current = true
      driverRef.current?.destroy()
      driverRef.current = null
      suppressDestroyPersistenceRef.current = false
      dismissalStatusRef.current = null

      const steps = buildContextualTourSteps(pathname, renderMascot, destroyContextualTour)
      if (steps.length === 0) return

      const driverObj = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        showButtons: ["next", "previous"],
        allowClose: false,
        overlayOpacity: 0.65,
        popoverClass: "driverjs-theme-researcher",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        onPopoverRender: (popover) => injectContextCloseButton(popover),
        onDestroyStarted: () => {
          /* Contextual help never writes skip/completed to profile or localStorage */
        },
        steps,
      })

      driverRef.current = driverObj

      const delayMs = 120
      pendingStartTimerRef.current = window.setTimeout(() => {
        pendingStartTimerRef.current = null
        if (!cancelled && tourGeneration === myGeneration) {
          driverObj.drive()
        }
      }, delayMs)
    }

    const onPageHelp = (event: Event) => {
      const detail = (event as CustomEvent<PageHelpEventDetail>).detail
      const pathname = detail?.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/dashboard")
      void runContextualPageHelp(pathname)
    }

    window.addEventListener(NOTES9_PAGE_HELP_EVENT, onPageHelp as EventListener)
    void runOnboardingTour()

    return () => {
      cancelled = true
      clearPendingStart()
      window.removeEventListener(NOTES9_PAGE_HELP_EVENT, onPageHelp as EventListener)
      suppressDestroyPersistenceRef.current = true
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [mounted, router])

  return null
}
