"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MagnifyingGlass, X } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { PlotlyChart } from "@/components/data-analysis/plotly-chart"
import { buildHelpFigure } from "@/lib/data-analysis/help-figures"
import { HelpMockupView } from "./help-mockups"
import {
  HELP_SECTIONS,
  searchHelp,
  type HelpEntry,
} from "@/lib/data-analysis/help-content"

/**
 * The reference manual, in the app.
 *
 * A workspace that infers column roles, repairs your file, picks a statistical
 * test and fits a curve is making a lot of claims about method, and the place
 * to explain them is not a tooltip. This is the long-form version: every check
 * that runs, every test with its assumptions, every chart type, and what the
 * software does with your data — arranged so it can be read through once and
 * then returned to for one answer.
 *
 * Content lives in `help-content.ts` as data, so it is searchable and testable;
 * this file is only the reading surface.
 */
export function HelpCenter({
  open,
  onOpenChange,
  /** Section to land on, e.g. "tests" from the statistics panel. */
  initialSectionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSectionId?: string
}) {
  const [query, setQuery] = useState("")
  const [sectionId, setSectionId] = useState(initialSectionId ?? HELP_SECTIONS[0].id)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) {
      setSectionId(initialSectionId ?? HELP_SECTIONS[0].id)
      setQuery("")
    }
  }, [open, initialSectionId])

  // Moving between sections should start at the top of the new one, not
  // wherever the previous one happened to be scrolled to.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [sectionId, query])

  const results = useMemo(() => (query.trim() ? searchHelp(query) : null), [query])
  const section = HELP_SECTIONS.find((s) => s.id === sectionId) ?? HELP_SECTIONS[0]

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[3px]"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Analysis help"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onOpenChange(false)
          }
        }}
        className="fixed left-1/2 top-1/2 z-50 flex h-[min(46rem,88vh)] w-[min(62rem,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* ── contents ────────────────────────────────────────────────── */}
        <nav className="hidden w-56 shrink-0 flex-col border-r border-border bg-muted/25 sm:flex">
          <div className="border-b border-border px-4 py-3.5">
            <p className="text-[13.5px] font-semibold">Help</p>
            <p className="text-[11.5px] text-muted-foreground">Data analysis in Notes9</p>
          </div>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {HELP_SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setSectionId(s.id)
                  }}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                    !results && s.id === sectionId
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {s.title}
                  <span className="block text-[10.5px] text-muted-foreground/80">
                    {s.entries.length} topic{s.entries.length === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── reading pane ────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — “paired”, “outlier”, “error bars”, “4PL”…"
                className="h-8 pl-8 text-[12.5px]"
              />
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close help"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {results ? (
              <>
                <p className="mb-3 text-[12px] text-muted-foreground">
                  {results.length === 0
                    ? `Nothing matches “${query}”.`
                    : `${results.length} topic${results.length === 1 ? "" : "s"} matching “${query}”`}
                </p>
                <div className="space-y-4">
                  {results.map((entry) => (
                    <Entry key={entry.id} entry={entry} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{section.title}</h2>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{section.blurb}</p>
                <div className="mt-4 space-y-5">
                  {section.entries.map((entry) => (
                    <Entry key={entry.id} entry={entry} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * A figure, drawn with the product's own Plotly build.
 *
 * Not an image and not a redrawing: the same renderer, so what a reader sees
 * here is what their own chart will look like. The fixtures are fixed, so the
 * illustration does not change shape between two readings of the same page.
 */
function Figure({ kind, caption }: { kind: string; caption: string }) {
  const spec = buildHelpFigure(kind)
  if (!spec) return null
  return (
    <figure className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-muted/15 p-2">
      <div style={{ height: spec.height }}>
        <PlotlyChart data={spec.data} layout={spec.layout} className="h-full w-full" />
      </div>
      <figcaption className="px-1 pb-0.5 pt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  )
}

function Mockup({ kind, caption }: { kind: string; caption: string }) {
  return (
    <figure className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-muted/15 p-2">
      <div className="overflow-x-auto">
        <HelpMockupView kind={kind} />
      </div>
      <figcaption className="px-1 pb-0.5 pt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  )
}

function Entry({ entry }: { entry: HelpEntry }) {
  return (
    <article id={entry.id} className="rounded-xl border border-border/70 bg-background p-4">
      <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{entry.title}</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{entry.summary}</p>
      <div className="mt-2.5 space-y-2">
        {entry.body.map((paragraph, i) => (
          // `max-w` on the prose rather than the pane: a 62rem dialog would
          // otherwise set 130-character lines, which nobody reads twice.
          <p key={i} className="max-w-[68ch] text-[12.5px] leading-relaxed text-foreground/90">
            {paragraph}
          </p>
        ))}
      </div>
      {entry.mockups?.map((m) => (
        <Mockup key={m.kind} kind={m.kind} caption={m.caption} />
      ))}
      {/* Two across where there are several, so a gallery of chart types reads
          as a comparison rather than as a column to scroll. */}
      <div className={cn(entry.figures && entry.figures.length > 1 && "grid gap-0 sm:grid-cols-2 sm:gap-3")}>
        {entry.figures?.map((f) => (
          <Figure key={f.kind} kind={f.kind} caption={f.caption} />
        ))}
      </div>
      {entry.facts && entry.facts.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-lg border border-border/70 bg-muted/25 p-2.5 sm:grid-cols-[auto_1fr]">
          {entry.facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {f.label}
              </dt>
              <dd className="mb-1 text-[12px] text-foreground/90 sm:mb-0">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}
