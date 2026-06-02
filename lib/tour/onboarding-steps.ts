import type { TourStep } from "@/components/tour/product-tour"
import { TOUR, tourSel } from "@/lib/tour/anchors"

/** Open the Catalyst AI sidebar (handled in components/layout/app-layout.tsx). */
function openAiSidebar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))
  }
}

/** Ask the tour controller to client-navigate (handled in components/tour/app-tour.tsx),
 *  so a step lands on the right page whether the user clicked or pressed Next. */
function navigateTo(path: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("notes9:tour-navigate", { detail: { path } }))
  }
}

/**
 * The interactive product onboarding tour for the current UI.
 *
 * Targets are persistent app chrome (sidebar + header) mounted on every
 * authenticated route, so the tour runs from anywhere and never depends on a
 * route-specific element that may not exist for a brand-new user. A few steps
 * are interactive — the user clicks the highlighted element to navigate and the
 * tour follows them into the page. Steps whose anchor is absent are skipped by
 * the engine rather than hanging.
 */
export function buildOnboardingSteps(): TourStep[] {
  return [
    {
      title: "Welcome to your workspace",
      body: "Let's take a quick, hands-on tour. I'll highlight things as we go — you can click around to explore, and reopen this anytime from the **?** button.",
    },
    {
      target: tourSel(TOUR.sidebarNav),
      side: "right",
      title: "Everything in one place",
      body: "Your whole workspace lives in this sidebar — Projects, Literature, Catalyst AI, and the research map are always a click away.",
    },
    {
      target: tourSel(TOUR.navProjects),
      side: "right",
      title: "Projects come first",
      body: "**Projects** are the home for your research. Every experiment, lab note, and protocol lives inside one — so this is where you start.",
      interactive: true,
      advanceOnClick: true,
      cta: "Click Projects to open your list",
    },
    {
      target: "#tour-create-project, " + tourSel(TOUR.createProject),
      side: "bottom",
      title: "Create your first project",
      body: "This button starts a new project. Once it exists, you can attach experiments, protocols, samples, and lab notes — all grouped together.",
      onBeforeStep: () => navigateTo("/projects"),
      interactive: true,
      cta: "Try it, or hit Next to keep going",
    },
    {
      target: tourSel(TOUR.createNew),
      side: "right",
      title: "Create anything, instantly",
      body: "**Create new** is your shortcut for projects, experiments, lab notes, samples, and more — from any screen, without losing your place.",
    },
    {
      target: tourSel(TOUR.navLiterature),
      side: "right",
      title: "Keep the literature close",
      body: "Collect papers and references in **Literature**, linked right back to the experiments they support.",
      interactive: true,
      advanceOnClick: true,
      cta: "Click Literature to take a peek",
    },
    {
      target: tourSel(TOUR.aiToggle),
      side: "bottom",
      title: "Meet Catalyst, your AI partner",
      body: "Catalyst reasons over your lab data with full context. Let's open it.",
      onBeforeStep: openAiSidebar,
      interactive: true,
      advanceOnClick: true,
      cta: "Click to open Catalyst",
    },
    {
      target: "#tour-ai-chat",
      side: "left",
      title: "Ask anything",
      body: "Type a question, ask Catalyst to draft a lab note, summarize a paper, or plan an experiment. It already knows your projects and notes.\n\nTip: type **@** to tag a specific note, experiment, or paper.",
      onBeforeStep: openAiSidebar,
      interactive: true,
      cta: "Try typing a question",
    },
    {
      target: "#tour-ai-web-search",
      side: "top",
      title: "Reach beyond your lab",
      body: "Flip on **Web** and Catalyst can search the internet alongside your own data — perfect for fresh literature or protocols.",
      onBeforeStep: openAiSidebar,
    },
    {
      target: tourSel(TOUR.sidebarSearch),
      side: "right",
      title: "Find anything in seconds",
      body: "Search across projects, experiments, notes, and inventory from here — no matter where you are.",
      interactive: true,
      cta: "Give it a try",
    },
    {
      target: tourSel(TOUR.help),
      side: "bottom",
      title: "Help is always one click away",
      body: "Tap the **?** anytime for a guided tour of whatever page you're on. You can replay this whole tour from there too.",
    },
    {
      title: "You're ready to go 🚀",
      body: "That's the tour! Create your first **project** to get rolling — and remember, Catalyst is right there whenever you need a hand.",
    },
  ]
}
