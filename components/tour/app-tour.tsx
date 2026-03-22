"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { driver, type Driver, type PopoverDOM } from "driver.js"
import "driver.js/dist/driver.css"
import { createClient } from "@/lib/supabase/client"

type TourStatus = "completed" | "skipped"

const TOUR_COMPLETED_KEY = "notes9_tour_completed"
const TOUR_SKIPPED_KEY = "notes9_tour_skipped"

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
    let timer: number | null = null
    const supabase = createClient()
    suppressDestroyPersistenceRef.current = false

    const renderMascot = (htmlContent: string) => `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-top:8px;">
        <img src="/notes9-mascot.png" class="tour-mascot-animate" alt="Notes9 Mascot" style="width:52px;height:52px;object-fit:contain;flex-shrink:0;border-radius:50%;" />
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

    const startTour = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || cancelled) return

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("notes9_tour_completed_at, notes9_tour_skipped_at")
        .eq("id", user.id)
        .single()

      const shouldSuppressTour =
        (!error && Boolean(profile?.notes9_tour_completed_at || profile?.notes9_tour_skipped_at)) ||
        localStorage.getItem(TOUR_COMPLETED_KEY) === "true" ||
        localStorage.getItem(TOUR_SKIPPED_KEY) === "true"

      if (shouldSuppressTour || cancelled) return

      window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))

      const steps = [
        {
          popover: {
            title: "Welcome to Notes9",
            description: renderMascot("This quick onboarding tour shows you the core research flow: start with a project, add experiments inside it, capture notes, and use the AI sidebar without losing context."),
            side: "top" as const,
            align: "center" as const,
            nextBtnText: "Start tour",
          },
        },
        {
          element: "#tour-main-nav",
          popover: {
            title: "Your research workspace",
            description: renderMascot("The left navigation follows the structure of a real lab workflow. You will usually move from <b>Projects</b> to <b>Experiments</b>, then into <b>Lab Notes</b>, protocols, inventory, and literature."),
            side: "right" as const,
            align: "start" as const,
          },
        },
        {
          element: "a[href='/projects']",
          popover: {
            title: "Projects come first",
            description: renderMascot("Projects are the top-level containers for each research effort. Create one first so Notes9 has a home for the experiments and notes that follow."),
            side: "right" as const,
            align: "center" as const,
            onNextClick: () => {
              void navigateAndAdvance("/projects", "#tour-create-project")
            },
          },
        },
        {
          element: "#tour-create-project",
          popover: {
            title: "Create a project here",
            description: renderMascot("This is the entry point for a new project. Once a project exists, you can organize experiments, assign collaborators, and keep the whole study grouped together."),
            side: "bottom" as const,
            align: "end" as const,
            onNextClick: () => {
              void navigateAndAdvance("/experiments", "a[href='/experiments']")
            },
          },
        },
        {
          element: "a[href='/experiments']",
          popover: {
            title: "Experiments live inside projects",
            description: renderMascot("Experiments capture the specific procedures and study runs inside a project. Notes9 keeps them linked so your structure stays clear as the work grows."),
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          element: "#tour-create-experiment",
          popover: {
            title: "Create an experiment here",
            description: renderMascot("Use this button after your project exists. Each experiment can then connect to protocols, samples, equipment usage, and lab notes."),
            side: "bottom" as const,
            align: "end" as const,
          },
        },
        {
          element: "a[href='/lab-notes']",
          popover: {
            title: "Capture the work in lab notes",
            description: renderMascot("Lab Notes are where your daily observations, inline comments, linked protocols, and AI-assisted writing come together during active research."),
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          element: "a[href='/protocols']",
          popover: {
            title: "Reuse protocols across studies",
            description: renderMascot("Protocols hold your repeatable SOP-style steps so experiments can stay standardized instead of rewriting the same process each time."),
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          element: "a[href='/literature-reviews']",
          popover: {
            title: "Keep literature close to the work",
            description: renderMascot("The literature area helps you collect papers, read PDFs, and connect evidence directly back into your Notes9 workflow."),
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          element: "#tour-search",
          popover: {
            title: "Search across the workspace",
            description: renderMascot("Global search lets you jump quickly to projects, experiments, notes, and inventory from anywhere in the app."),
            side: "right" as const,
            align: "start" as const,
          },
        },
        {
          element: "#tour-ai-chat",
          onHighlightStarted: () => {
            window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))
          },
          popover: {
            title: "Your AI sidebar stays open during onboarding",
            description: renderMascot("The AI assistant is already open for your first tour so you can see where to ask questions, attach context, and get help without losing your place."),
            side: "left" as const,
            align: "end" as const,
          },
        },
        {
          element: "#tour-ai-mode",
          onHighlightStarted: () => {
            window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))
          },
          popover: {
            title: "Choose the right AI mode",
            description: renderMascot("Use <b>General</b> for broad research help and web-aware tasks. Switch to <b>Notes9</b> when you want the assistant to stay grounded in your workspace context and uploaded materials."),
            side: "top" as const,
            align: "start" as const,
          },
        },
        {
          element: "#tour-theme-toggle",
          popover: {
            title: "You are ready to work",
            description: renderMascot("That is the core workflow: create a project, add experiments, document the work, and use the AI sidebar to stay productive. You can switch themes here any time."),
            side: "bottom" as const,
            align: "end" as const,
            doneBtnText: "Finish tour",
            onNextClick: () => {
              void finalizeTour(user.id, "completed")
            },
          },
        },
      ]

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
        steps,
      })

      driverRef.current = driverObj

      timer = window.setTimeout(() => {
        if (!cancelled) {
          driverObj.drive()
        }
      }, 900)
    }

    void startTour()

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      suppressDestroyPersistenceRef.current = true
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [mounted, router])

  return null
}
