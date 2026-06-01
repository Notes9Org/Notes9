"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { ProductTour } from "@/components/tour/product-tour"
import { WelcomeDialog, type WelcomeResult } from "@/components/tour/welcome-dialog"
import { buildOnboardingSteps } from "@/lib/tour/onboarding-steps"
import { buildContextualSteps } from "@/lib/tour/contextual-steps"
import { CURRENT_TERMS_VERSION } from "@/lib/constants"

type TourStatus = "completed" | "skipped"
type TourMode = "idle" | "welcome" | "onboarding" | "page"

// localStorage keys are scoped per-user so a brand-new sign-up (including Google
// / Microsoft OAuth) on a browser that previously hosted another account still
// gets onboarding.
const welcomeSeenKey = (userId: string) => `notes9_welcome_seen:${userId}`
const tourDoneKey = (userId: string) => `notes9_tour_done:${userId}`

/** Dispatch with `detail.pathname` for a short, page-specific tour. */
export const NOTES9_PAGE_HELP_EVENT = "notes9:page-help"
/** Dispatch to (re)start the full product tour, bypassing completion flags. */
export const NOTES9_START_TOUR_EVENT = "notes9:start-tour"

export type PageHelpEventDetail = { pathname: string }

export function requestPageHelp(pathname: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<PageHelpEventDetail>(NOTES9_PAGE_HELP_EVENT, {
      detail: { pathname: pathname || "/dashboard" },
    }),
  )
}

/** Re-run the onboarding product tour (e.g. from the dashboard first-run card). */
export function requestStartTour() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(NOTES9_START_TOUR_EVENT))
}

export function AppTour() {
  const user = useAuthUser()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<TourMode>("idle")
  const [pageSteps, setPageSteps] = useState<ReturnType<typeof buildContextualSteps>>([])
  const [firstName, setFirstName] = useState("there")

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => (supabaseRef.current ??= createClient())

  const onboardingSteps = useMemo(() => buildOnboardingSteps(), [])

  useEffect(() => setMounted(true), [])

  // ---- persistence helpers ----------------------------------------------
  const finalizeTour = (status: TourStatus) => {
    if (!user) return
    localStorage.setItem(tourDoneKey(user.id), status)
    const updates =
      status === "completed"
        ? { notes9_tour_completed_at: new Date().toISOString() }
        : { notes9_tour_skipped_at: new Date().toISOString() }
    void getSupabase().from("profiles").update(updates).eq("id", user.id)
  }

  const persistWelcome = (result: WelcomeResult) => {
    if (!user) return
    localStorage.setItem(welcomeSeenKey(user.id), "true")
    const updates: Record<string, string> = {
      notes9_welcome_seen_at: new Date().toISOString(),
    }
    if (result.jobTitle) updates.job_title = result.jobTitle
    if (result.sector) updates.sector = result.sector
    if (result.organizationName) updates.organization_name = result.organizationName
    if (result.researchField) updates.research_field = result.researchField
    if (result.primaryGoal) updates.primary_goal = result.primaryGoal
    void getSupabase().from("profiles").update(updates).eq("id", user.id)
  }

  // The welcome wizard must not appear until the user has accepted the current
  // terms — a brand-new signup sees the terms gate FIRST, then the tour. This is
  // read from the auth user, which the terms modal refreshes on accept (via
  // refreshSession → onAuthStateChange), so the value flips here automatically.
  // Existing users have already accepted, so this is true immediately (no change
  // to their flow).
  const termsAccepted =
    user?.user_metadata?.terms_accepted_version === CURRENT_TERMS_VERSION

  // ---- new-user bootstrap: decide whether to show the welcome modal -------
  useEffect(() => {
    if (!mounted || !user) return
    // Defer onboarding until terms are accepted. The effect re-runs once `termsAccepted` flips.
    if (!termsAccepted) return

    let cancelled = false
    const run = async () => {
      const metaFirst =
        (user.user_metadata?.first_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
        user.email?.split("@")[0] ||
        "there"

      // Fast per-user client gate so returning users never flash the modal.
      if (localStorage.getItem(welcomeSeenKey(user.id)) === "true") {
        if (!cancelled) setFirstName(metaFirst)
        return
      }

      // The DB is the source of truth. A brand-new profile — created on email,
      // Google, or Microsoft sign-up (via app code or the handle_new_user
      // trigger) — has `notes9_welcome_seen_at = NULL`, so onboarding shows. If
      // the row isn't readable yet (provisioning/replication race right after
      // OAuth), retry briefly rather than silently skipping onboarding.
      let profile:
        | { first_name?: string | null; notes9_welcome_seen_at?: string | null }
        | null = null
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const { data, error } = await getSupabase()
          .from("profiles")
          .select("first_name, notes9_welcome_seen_at")
          .eq("id", user.id)
          .maybeSingle()
        if (data) {
          profile = data
          break
        }
        if (error) {
          console.error("AppTour profile fetch error:", error)
        } else {
          console.warn(
            `app-tour: profile not yet readable for user ${user.id} (attempt ${attempt + 1}/3); retrying`,
          )
        }
        await new Promise((r) => setTimeout(r, 600))
      }
      if (cancelled) return

      setFirstName((profile?.first_name as string | undefined)?.trim() || metaFirst)

      if (!profile?.notes9_welcome_seen_at) setMode("welcome")
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [mounted, user, termsAccepted])

  // ---- event wiring: page help + manual tour restart ---------------------
  useEffect(() => {
    if (!mounted) return

    const onPageHelp = (event: Event) => {
      const detail = (event as CustomEvent<PageHelpEventDetail>).detail
      const pathname = detail?.pathname ?? window.location.pathname ?? "/dashboard"
      setPageSteps(buildContextualSteps(pathname))
      setMode("page")
    }
    const onStartTour = () => setMode("onboarding")
    const onNavigate = (event: Event) => {
      const path = (event as CustomEvent<{ path: string }>).detail?.path
      if (path) router.push(path)
    }

    window.addEventListener(NOTES9_PAGE_HELP_EVENT, onPageHelp as EventListener)
    window.addEventListener(NOTES9_START_TOUR_EVENT, onStartTour)
    window.addEventListener("notes9:tour-navigate", onNavigate as EventListener)
    return () => {
      window.removeEventListener(NOTES9_PAGE_HELP_EVENT, onPageHelp as EventListener)
      window.removeEventListener(NOTES9_START_TOUR_EVENT, onStartTour)
      window.removeEventListener("notes9:tour-navigate", onNavigate as EventListener)
    }
  }, [mounted, router])

  // ---- handlers ----------------------------------------------------------
  const handleWelcomeComplete = (result: WelcomeResult) => {
    persistWelcome(result)
    if (result.startTour) {
      setMode("onboarding")
    } else {
      finalizeTour("skipped")
      setMode("idle")
    }
  }

  if (!mounted) return null

  return (
    <>
      <WelcomeDialog
        open={mode === "welcome"}
        firstName={firstName}
        onComplete={handleWelcomeComplete}
      />

      {mode === "onboarding" && (
        <ProductTour
          steps={onboardingSteps}
          skipLabel="Skip tour"
          doneLabel="Finish"
          onFinish={() => {
            finalizeTour("completed")
            setMode("idle")
          }}
          onSkip={() => {
            finalizeTour("skipped")
            setMode("idle")
          }}
        />
      )}

      {mode === "page" && pageSteps.length > 0 && (
        <ProductTour
          steps={pageSteps}
          skipLabel="Close"
          doneLabel="Done"
          onFinish={() => setMode("idle")}
          onSkip={() => setMode("idle")}
        />
      )}
    </>
  )
}
