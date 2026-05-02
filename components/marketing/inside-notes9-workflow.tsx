"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Folder,
  Home,
  Network,
  NotebookPen,
  Package,
  ScrollText,
  type LucideIcon,
} from "lucide-react"

import { SectionHeader } from "@/components/marketing/site-ui"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { cn } from "@/lib/utils"

type WorkflowPanelId =
  | "dashboard"
  | "projects"
  | "literature"
  | "protocols"
  | "samples"
  | "eln"
  | "data"
  | "writing"
  | "map"

const PANELS: Record<
  WorkflowPanelId,
  {
    headline: string
    body: string
    videoLabel: string
  }
> = {
  dashboard: {
    headline: "Your research home base - all you need to start your day.",
    body:
      "See your to-do list, open your whiteboard for quick ideas, and pick up from your most recently used projects and experiments. Everything is where you left it - so the day starts in motion, not in searching.",
    videoLabel: "Dashboard walkthrough",
  },
  projects: {
    headline: "Create a project. Everything else connects automatically.",
    body:
      "Every project in Notes9 automatically creates a Literature tab, Protocols, Lab Notebook, Data & Analysis, and Writing - all linked. Everything you do lives under the project. Nothing gets scattered.",
    videoLabel: "Projects walkthrough",
  },
  literature: {
    headline: "Find, read, and save papers.",
    body:
      "Search PubMed, OpenAlex, and Europe PMC directly inside Notes9. Open PDFs, annotate, highlight, make notes, and save papers straight into the project they belong to.",
    videoLabel: "Literature walkthrough",
  },
  protocols: {
    headline: "Design, version, and reuse protocols.",
    body:
      "Write protocols from scratch, use templates from previous work, or build on older versions. Every protocol is versioned so you can track changes and reuse methods across projects without starting over.",
    videoLabel: "Protocols walkthrough",
  },
  samples: {
    headline: "Know exactly where it is.",
    body:
      "Keep records of every sample and reagent - storage location, quantity, expiry dates, and which experiments they belong to. No more searching the freezer or discovering expired reagents mid-experiment.",
    videoLabel: "Samples walkthrough",
  },
  eln: {
    headline: "Capture everything you did on bench.",
    body:
      "Type, voice record, or photograph handwritten notes and have them converted into structured digital entries. Add equations, chemical formulas, and images. Everything gets saved and linked to the right experiment automatically.",
    videoLabel: "Lab notebook walkthrough",
  },
  data: {
    headline: "Store all your data. Analyse without switching tools.",
    body:
      "Upload data in any format - Excel, CSV, PDF, Word, images, and more. Open Excel files directly inside Notes9 to run calculations and generate graphs. Drag those graphs straight into your reports without leaving the platform.",
    videoLabel: "Data & analysis walkthrough",
  },
  writing: {
    headline: "From results to report, paper, or grant - without starting from scratch.",
    body:
      "Create reports using built-in templates, generate PowerPoint presentations, write grant applications, abstracts, and research papers — all inside the project. The context is already there because the workflow is connected.",
    videoLabel: "Reports & writing walkthrough",
  },
  map: {
    headline: "See everything connected - at a glance.",
    body:
      "The Research Map shows a visual overview of everything linked inside a project - papers, experiments, lab notes, data, status. Double-click any node to jump directly into that part of the project.",
    videoLabel: "Research map walkthrough",
  },
}

/** Matches marketing theme accent — one treatment for every nav icon */
const NAV_ICON_BOX =
  "flex size-[26px] shrink-0 items-center justify-center rounded-md bg-[var(--n9-accent-light)] text-[var(--n9-accent)]"

type NavRow =
  | { id: WorkflowPanelId; name: string; kind: "lucide"; Icon: LucideIcon }
  | { id: WorkflowPanelId; name: string; kind: "protocols" }

const NAV_ORDER: NavRow[] = [
  { id: "dashboard", name: "Dashboard", kind: "lucide", Icon: Home },
  { id: "projects", name: "Projects", kind: "lucide", Icon: Folder },
  { id: "literature", name: "Literature", kind: "lucide", Icon: BookOpen },
  { id: "protocols", name: "Protocols", kind: "protocols" },
  { id: "samples", name: "Samples & Inventory", kind: "lucide", Icon: Package },
  { id: "eln", name: "Lab Notebook", kind: "lucide", Icon: NotebookPen },
  { id: "data", name: "Data & Analysis", kind: "lucide", Icon: BarChart3 },
  { id: "writing", name: "Reports & Writing", kind: "lucide", Icon: ScrollText },
  { id: "map", name: "Research Map", kind: "lucide", Icon: Network },
]

function NavIconGlyph({ row }: { row: NavRow }) {
  if (row.kind === "protocols") {
    return (
      <div className={NAV_ICON_BOX}>
        <ClipboardInfoIcon className="size-[14px]" aria-hidden />
      </div>
    )
  }
  const I = row.Icon
  return (
    <div className={NAV_ICON_BOX}>
      <I className="size-[14px]" strokeWidth={2} aria-hidden />
    </div>
  )
}

export function InsideNotes9Workflow() {
  const [active, setActive] = useState<WorkflowPanelId>("dashboard")
  const panel = PANELS[active]

  return (
    <>
      <SectionHeader
        align="center"
        className="max-w-[84rem]"
        badge="The research journey"
        title="From the first idea to final breakthrough."
        description="Notes9 captures everything thatresearchers actually do."
      />

      <div
        className="mt-10 overflow-hidden rounded-[var(--radius)] border border-border/80 bg-background shadow-sm"
        role="region"
        aria-label="Inside Notes9 workflow"
      >
        <div className="grid min-h-[784px] grid-cols-1 md:grid-cols-[252px_1fr] md:min-h-[840px]">
          <div className="flex flex-col border-b border-border/80 bg-muted/40 md:border-b-0 md:border-r dark:bg-muted/20">
            <div className="border-b border-border/80 px-3.5 py-3 text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
              Inside Notes9
            </div>
            <nav className="flex flex-col" aria-label="Workflow areas">
              {NAV_ORDER.map((item) => {
                const isOn = active === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActive(item.id)}
                    aria-current={isOn ? "true" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 border-b border-border/80 px-3.5 py-[11px] text-left transition-colors last:border-b-0",
                      "border-l-2 border-l-transparent hover:bg-background/80",
                      isOn && "border-l-[var(--n9-accent)] bg-background dark:bg-background/60",
                    )}
                  >
                    <NavIconGlyph row={item} />
                    <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{item.name}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="flex min-h-[784px] flex-col gap-0 px-6 py-6 sm:px-8 md:min-h-[840px]">
            <h3 className="mb-3 font-serif text-xl font-medium leading-snug tracking-tight text-foreground sm:text-2xl">
              {panel.headline}
            </h3>

            <div className="mb-4 flex min-h-[280px] flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-border/80 bg-muted/30 dark:bg-muted/15 sm:min-h-[308px]">
              <div
                className="flex size-[34px] items-center justify-center rounded-full bg-[var(--n9-accent)] text-primary-foreground shadow-sm"
                aria-hidden
              >
                <span className="ml-0.5 border-y-[6px] border-l-[11px] border-y-transparent border-l-white" />
              </div>
              <p className="text-sm text-muted-foreground">Watch: {panel.videoLabel}</p>
            </div>

            <p className="mb-4 max-w-[117ch] flex-none text-sm leading-relaxed text-muted-foreground sm:text-base">
              {panel.body}
            </p>

            <Link
              href="/auth/login"
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--n9-accent)] px-3.5 py-2 text-sm font-medium text-[var(--n9-accent)] transition-colors hover:bg-[var(--n9-accent-light)]"
            >
              Explore {NAV_ORDER.find((n) => n.id === active)?.name ?? "Notes9"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
