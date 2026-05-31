import type { TourStep } from "@/components/tour/product-tour"
import { TOUR, tourSel } from "@/lib/tour/anchors"

/** Open the Catalyst AI sidebar (handled in components/layout/app-layout.tsx). */
function openAiSidebar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))
  }
}

function normalizeAppPath(pathname: string): string {
  const raw = (pathname || "/dashboard").trim()
  const noQuery = raw.split("?")[0] || "/dashboard"
  const trimmed = noQuery.length > 1 ? noQuery.replace(/\/$/, "") : noQuery
  return trimmed || "/dashboard"
}

const navStep: TourStep = {
  target: tourSel(TOUR.sidebarNav),
  side: "right",
  title: "Workspace navigation",
  body: "Move between Dashboard, Projects, Literature, Catalyst, and the research map from here.",
}

const searchStep: TourStep = {
  target: tourSel(TOUR.sidebarSearch),
  side: "right",
  title: "Search everything",
  body: "Jump straight to any project, experiment, note, or sample.",
  interactive: true,
  cta: "Try a search",
}

const createStep: TourStep = {
  target: tourSel(TOUR.createNew),
  side: "right",
  title: "Create anything",
  body: "Add a project, experiment, lab note, sample, and more — from any screen.",
}

const aiStep: TourStep = {
  target: "#tour-ai-chat",
  side: "left",
  title: "Catalyst is here to help",
  body: "Ask questions, draft notes, or summarize results — with your work already in context. Type **@** to tag a note, experiment, or paper.",
  onBeforeStep: openAiSidebar,
  interactive: true,
  cta: "Try asking something",
}

const helpStep: TourStep = {
  target: tourSel(TOUR.help),
  side: "bottom",
  title: "Page help, anytime",
  body: "The **?** button always opens a short tour for whatever page you're viewing.",
}

/**
 * Short, page-specific help tours triggered by the header "?" button. Each page
 * gets several focused, interactive steps. Targets only use anchors known to
 * exist in the current UI; anything missing is skipped by the tour engine.
 */
export function buildContextualSteps(pathname: string): TourStep[] {
  const path = normalizeAppPath(pathname)

  if (path.startsWith("/projects")) {
    return [
      {
        title: "Projects",
        body: "Projects are the top-level containers for each research effort — they group experiments, notes, protocols, and collaborators in one place.",
      },
      {
        target: "#tour-create-project, " + tourSel(TOUR.createProject),
        side: "bottom",
        title: "Create a project",
        body: "Start a new project here. Give it a name and you're ready to add experiments and notes inside it.",
        interactive: true,
        cta: "Click to create one",
      },
      createStep,
      aiStep,
      navStep,
    ]
  }

  if (path.startsWith("/experiments")) {
    return [
      {
        title: "Experiments",
        body: "Experiments capture the specific runs and procedures inside a project — linked to their protocols, samples, and lab notes.",
      },
      {
        target: "#tour-create-experiment, " + tourSel(TOUR.createExperiment),
        side: "bottom",
        title: "Create an experiment",
        body: "Add an experiment here. Each one can connect to protocols, samples, equipment, and lab notes.",
        interactive: true,
        cta: "Click to add one",
      },
      aiStep,
      navStep,
    ]
  }

  if (path.startsWith("/lab-notes")) {
    return [
      {
        title: "Lab notes",
        body: "Lab notes are where daily observations, methods, and results live — with comments, linked materials, and AI assistance right alongside.",
      },
      createStep,
      aiStep,
      navStep,
    ]
  }

  if (path.startsWith("/protocols")) {
    return [
      {
        title: "Protocols",
        body: "Protocols store repeatable, versioned procedures so your experiments stay consistent instead of rewriting the same steps.",
      },
      createStep,
      aiStep,
      navStep,
    ]
  }

  if (path.startsWith("/literature-reviews") || path.startsWith("/papers")) {
    return [
      {
        title: "Literature",
        body: "Collect papers, read PDFs, and keep citations tied to the projects and experiments they support.",
      },
      {
        ...aiStep,
        body: "Ask Catalyst to summarize a paper, extract methods, or compare studies. Type **@** to reference a specific paper.",
      },
      navStep,
    ]
  }

  if (path.startsWith("/samples")) {
    return [
      {
        title: "Samples",
        body: "Track reagents, cells, constructs, and other materials with codes, storage locations, and links to experiments.",
      },
      createStep,
      navStep,
    ]
  }

  if (path.startsWith("/equipment")) {
    return [
      {
        title: "Equipment",
        body: "Register instruments, maintenance dates, and locations so the lab always knows what's available and where.",
      },
      navStep,
    ]
  }

  if (path.startsWith("/research-map")) {
    return [
      {
        title: "Research map",
        body: "Visualize how projects, experiments, and notes connect, so the big picture stays clear as the work grows.",
      },
      aiStep,
      navStep,
    ]
  }

  if (path.startsWith("/reports")) {
    return [
      {
        title: "Reports",
        body: "Generate and review summaries that pull straight from your projects, experiments, and data.",
      },
      aiStep,
      navStep,
    ]
  }

  if (path.startsWith("/catalyst")) {
    return [
      {
        title: "Catalyst",
        body: "Catalyst is your AI research partner — ask questions, draft notes, and reason over your lab data with full context.",
      },
      navStep,
    ]
  }

  if (path.startsWith("/settings")) {
    return [
      {
        title: "Settings",
        body: "Manage your profile, preferences, organization, and how Notes9 behaves for your account.",
      },
      navStep,
    ]
  }

  if (path === "/dashboard" || path === "/") {
    return [
      {
        title: "Your dashboard",
        body: "This home view surfaces recent activity, your schedule, and shortcuts so you can pick up right where you left off.",
      },
      navStep,
      createStep,
      searchStep,
      {
        target: tourSel(TOUR.aiToggle),
        side: "bottom",
        title: "Catalyst AI",
        body: "Open Catalyst anytime to ask questions and work over your lab data.",
        onBeforeStep: openAiSidebar,
        interactive: true,
        advanceOnClick: true,
        cta: "Click to open Catalyst",
      },
      aiStep,
      helpStep,
    ]
  }

  return [
    {
      title: "Your workspace",
      body: "Notes9 groups your work into projects and experiments, with lab notes, protocols, samples, and literature alongside.",
    },
    navStep,
    aiStep,
    helpStep,
  ]
}
