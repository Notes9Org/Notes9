"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  NotebookPen,
  ScrollText,
  type LucideIcon,
} from "lucide-react"

import { SectionHeader } from "@/components/marketing/site-ui"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { cn } from "@/lib/utils"

type CatalystPanelId = "lit" | "protocol" | "lab" | "data" | "write"

const PANELS: Record<
  CatalystPanelId,
  {
    headline: string
    body: string
    videoLabel: string
  }
> = {
  lit: {
    headline: "Find relevant papers and read smarter.",
    body:
      "Drop a paper in and get an instant summary with citations you can click through to the exact passage in the PDF. Find related papers based on what you've already saved. Extract data tables and key findings without reading every line.",
    videoLabel: "Literature AI in action",
  },
  protocol: {
    headline: "Draft protocols from what the AI already knows about your project.",
    body:
      "Your AI lab assistant can draft a protocol using methods from your saved papers and previous protocols — grounded in your actual project literature, not a blank template. Update protocols by describing the change. The AI handles the edit.",
    videoLabel: "Protocol AI in action",
  },
  lab: {
    headline: "Capture notes the way you work. The AI organises the rest.",
    body:
      "Take a photo of handwritten notes and the AI digitises and structures them into a clean lab entry. Voice record observations mid-experiment. The AI transcribes, formats, and links the entry to the right experiment automatically.",
    videoLabel: "Lab notebook AI in action",
  },
  data: {
    headline: "Ask questions about your data in plain language.",
    body:
      "Upload a dataset and ask your AI lab assistant to run calculations, analyze patterns, QC data, or summarise key findings. Generated graphs can be dragged directly into your report.",
    videoLabel: "Data & Analysis AI in action",
  },
  write: {
    headline: "First drafts written from what actually happened in your project.",
    body:
      "Ask your AI lab assistant to draft a report, abstract, orgrant section - and it writes from your actual project data, notes, and results. Not a generic template.",
    videoLabel: "Writing AI in action",
  },
}

/** Same treatment as Inside Notes9 workflow nav */
const ICON_BOX =
  "flex size-[26px] shrink-0 items-center justify-center rounded-md bg-[var(--n9-accent-light)] text-[var(--n9-accent)]"

type NavRow =
  | { id: CatalystPanelId; name: string; kind: "lucide"; Icon: LucideIcon }
  | { id: CatalystPanelId; name: string; kind: "protocols" }

const NAV: NavRow[] = [
  { id: "lit", name: "Literature AI", kind: "lucide", Icon: BookOpen },
  { id: "protocol", name: "Protocol AI", kind: "protocols" },
  { id: "lab", name: "Lab Notebook AI", kind: "lucide", Icon: NotebookPen },
  { id: "data", name: "Data & Analysis AI", kind: "lucide", Icon: BarChart3 },
  { id: "write", name: "Writing AI", kind: "lucide", Icon: ScrollText },
]

function CatalystNavIcon({ row }: { row: NavRow }) {
  if (row.kind === "protocols") {
    return (
      <div className={ICON_BOX}>
        <ClipboardInfoIcon className="size-[14px]" aria-hidden />
      </div>
    )
  }
  const I = row.Icon
  return (
    <div className={ICON_BOX}>
      <I className="size-[14px]" strokeWidth={2} aria-hidden />
    </div>
  )
}

export function CatalystAISection() {
  const [active, setActive] = useState<CatalystPanelId>("lit")
  const panel = PANELS[active]
  const ctaVerb = NAV.find((n) => n.id === active)?.name ?? "Catalyst AI"

  return (
    <section className="relative border-t border-border/40 marketing-section-accent">
      <div className="relative z-10 container mx-auto px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <SectionHeader
          align="center"
          className="max-w-[84rem]"
          badge="Catalyst AI - your AI lab assistant"
          title="One AI that works across your entire research project."
          description="Not a chatbot. Not a search tool. An AI lab assistant that has read your papers, knows your protocols, understands your data, and can help across every step of your research."
        />

        <div className="mt-10 overflow-hidden rounded-[var(--radius)] border border-border/80 bg-background shadow-sm">
          <div className="grid min-h-[728px] grid-cols-1 md:grid-cols-[252px_1fr] md:min-h-[784px]">
            <div className="flex flex-col border-b border-border/80 bg-muted/40 md:border-b-0 md:border-r dark:bg-muted/20">
              <div className="border-b border-border/80 px-3.5 py-3 text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
                What Catalyst AI can do
              </div>
              <nav className="flex flex-col" aria-label="Catalyst AI capabilities">
                {NAV.map((item) => {
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
                      <CatalystNavIcon row={item} />
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{item.name}</span>
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="flex min-h-[728px] flex-col px-6 py-6 sm:px-8 md:min-h-[784px]">
              <h3 className="mb-4 font-serif text-xl font-medium leading-snug tracking-tight text-foreground sm:text-2xl">
                {panel.headline}
              </h3>

              <div className="mb-4 flex min-h-[252px] flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-border/80 bg-muted/30 dark:bg-muted/15 sm:min-h-[280px]">
                <div
                  className="flex size-[34px] items-center justify-center rounded-full bg-[var(--n9-accent)] text-primary-foreground shadow-sm"
                  aria-hidden
                >
                  <span className="ml-0.5 border-y-[6px] border-l-[11px] border-y-transparent border-l-white" />
                </div>
                <p className="text-sm text-muted-foreground">Watch: {panel.videoLabel}</p>
              </div>

              <p className="mb-4 max-w-[117ch] text-sm leading-relaxed text-muted-foreground sm:text-base">{panel.body}</p>

              <Link
                href="/auth/login"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--n9-accent)] px-3.5 py-2 text-sm font-medium text-[var(--n9-accent)] transition-colors hover:bg-[var(--n9-accent-light)]"
              >
                See {ctaVerb} in action
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
