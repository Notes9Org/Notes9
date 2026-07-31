"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  Sparkle,
  ArrowRight,
  ChatCircleDots,
  FileText,
  Flask,
  ChartBar,
  Table,
  ListChecks,
} from "@phosphor-icons/react/ssr"

/**
 * Interactive proof that Catalyst is an agent across the whole research
 * workflow, not a literature search box. The visitor picks a task type and
 * watches Catalyst produce the actual kind of output: a cited answer, a
 * protocol, an experiment plan, a generated chart, a spreadsheet edit, or a
 * project plan. All in-page (no data/sign-up needed to feel it).
 */

type Cap = {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string; weight?: "bold" | "fill" | "regular" }>
  prompt: string
  render: () => ReactNode
}

function SourceChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {items.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11.5px] text-muted-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--n9-accent)]" />
          {s}
        </span>
      ))}
    </div>
  )
}

const YIELD = [
  { ratio: "1:1", v: 38 },
  { ratio: "2:1", v: 64 },
  { ratio: "3:1", v: 100 },
  { ratio: "4:1", v: 71 },
]

const CAPS: Cap[] = [
  {
    id: "ask",
    label: "Answer a project question",
    Icon: ChatCircleDots,
    prompt: "Why did condition B give the highest transient yield?",
    render: () => (
      <div className="space-y-2 text-[14px] leading-relaxed text-foreground">
        <p>
          Condition B used a <strong>3:1 PEI:DNA ratio</strong>, the top-yield setting in your
          HEK293T screen, and it matches the ratio in two papers you saved.
        </p>
        <SourceChips items={["Expt #14", "Lab note · 2026-05-02", "Backliwal et al., 2008"]} />
      </div>
    ),
  },
  {
    id: "protocol",
    label: "Design a protocol",
    Icon: FileText,
    prompt: "Draft a transient transfection protocol for HEK293T.",
    render: () => (
      <div className="space-y-2">
        <p className="text-[14px] text-foreground">Drafted from your best-performing run:</p>
        <ol className="space-y-1.5 rounded-xl border border-border/50 bg-background/60 p-3 text-[13.5px] text-foreground/90">
          {[
            "Seed HEK293T to ~80% confluency.",
            "Complex DNA:PEI at a 3:1 (w/w) ratio in Opti-MEM; incubate 15 min.",
            "Add dropwise; replace medium after 4–6 h.",
            "Harvest supernatant at 72–96 h.",
          ].map((s, i) => (
            <li key={s} className="flex gap-2.5">
              <span className="font-semibold text-[var(--n9-accent)]">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>
    ),
  },
  {
    id: "experiment",
    label: "Plan an experiment",
    Icon: Flask,
    prompt: "Plan a screen to confirm the 3:1 PEI:DNA optimum.",
    render: () => (
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-background/60 p-3 text-[13px]">
        {[
          ["Objective", "Confirm 3:1 as the yield optimum"],
          ["Conditions", "1:1 · 2:1 · 3:1 · 4:1 (n=3)"],
          ["Controls", "Mock + untransfected"],
          ["Readout", "Titre (ELISA) + viability"],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              {k}
            </div>
            <div className="text-foreground/90">{v}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "graph",
    label: "Generate a graph",
    Icon: ChartBar,
    prompt: "Plot transient yield by PEI:DNA ratio from Expt #14.",
    render: () => (
      <div className="rounded-xl border border-border/50 bg-background/60 p-3">
        <div className="mb-2 text-[11.5px] font-medium text-muted-foreground">
          Relative transient yield (%)
        </div>
        <div className="flex h-32 items-end gap-3">
          {YIELD.map((d) => (
            <div key={d.ratio} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-md ${
                    d.v === 100
                      ? "bg-[var(--n9-accent)]"
                      : "bg-[var(--n9-accent)]/35"
                  }`}
                  style={{ height: `${d.v}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground">{d.ratio}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "sheet",
    label: "Edit a spreadsheet",
    Icon: Table,
    prompt: "Recalculate the dilution table for a 2 mg/mL stock.",
    render: () => (
      <div className="overflow-hidden rounded-xl border border-border/50 bg-background/60 text-[13px]">
        <div className="grid grid-cols-3 border-b border-border/50 bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          <span>Target</span>
          <span>Stock</span>
          <span>Add stock</span>
        </div>
        {[
          ["0.5 mg/mL", "2 mg/mL", "250 µL"],
          ["1.0 mg/mL", "2 mg/mL", "500 µL"],
          ["1.5 mg/mL", "2 mg/mL", "750 µL"],
        ].map((row, i) => (
          <div key={row[0]} className="grid grid-cols-3 px-3 py-1.5 text-foreground/90">
            <span>{row[0]}</span>
            <span>{row[1]}</span>
            <span
              className={
                i === 1
                  ? "rounded bg-[var(--n9-accent)]/15 font-semibold text-[var(--n9-accent)]"
                  : ""
              }
            >
              {row[2]}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "project",
    label: "Plan a project",
    Icon: ListChecks,
    prompt: "Outline a 3-month plan to express and purify the antibody.",
    render: () => (
      <ol className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-3 text-[13.5px]">
        {[
          ["Month 1", "Clone into pET-28a, confirm sequence"],
          ["Month 2", "Transient expression + PEI:DNA optimization"],
          ["Month 3", "IMAC purification + QC (SEC, endotoxin)"],
        ].map(([m, t]) => (
          <li key={m} className="flex gap-3">
            <span className="mt-0.5 shrink-0 rounded-md bg-[var(--n9-accent)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--n9-accent)]">
              {m}
            </span>
            <span className="text-foreground/90">{t}</span>
          </li>
        ))}
      </ol>
    ),
  },
]

export function CatalystWorkbench() {
  const [active, setActive] = useState(0)
  const [working, setWorking] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const run = (idx: number) => {
    if (timer.current) clearTimeout(timer.current)
    setActive(idx)
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      setWorking(false)
      return
    }
    setWorking(true)
    timer.current = setTimeout(() => setWorking(false), 900)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      run(0)
      return () => {
        if (timer.current) clearTimeout(timer.current)
      }
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true
            run(0)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cap = CAPS[active]

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-xl">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-[var(--n9-accent)]/[0.12] blur-[70px]" />
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/85 shadow-[0_40px_100px_-45px_rgba(44,36,24,0.5)] backdrop-blur-md">
        {/* header */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-muted/30 px-4 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--n9-accent)]/14 text-[var(--n9-accent)]">
            <Sparkle className="h-3.5 w-3.5" weight="fill" />
          </span>
          <span className="text-sm font-semibold text-foreground">Ask Catalyst</span>
          <span className="ml-auto rounded-full bg-background/70 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Demo project · Antibody expression
          </span>
        </div>

        {/* conversation */}
        <div className="min-h-[248px] space-y-4 px-4 py-5 sm:px-5">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--n9-accent)] px-4 py-2.5 text-[14px] leading-snug text-white shadow-sm">
              {cap.prompt}
            </div>
          </div>
          <div className="flex justify-start">
            <div className="w-full max-w-[94%]">
              {working ? (
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-2.5 text-[13px] text-muted-foreground">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--n9-accent)]/70 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--n9-accent)]/70 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--n9-accent)]/70" />
                  </span>
                  Working on it…
                </div>
              ) : (
                <div className="rounded-2xl rounded-tl-sm bg-muted/40 px-4 py-3">{cap.render()}</div>
              )}
            </div>
          </div>
        </div>

        {/* capability chips */}
        <div className="border-t border-border/50 bg-muted/20 px-4 py-3 sm:px-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            Catalyst can also…
          </p>
          <div className="flex flex-wrap gap-2">
            {CAPS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => run(i)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors duration-200 ${
                  i === active
                    ? "border-[var(--n9-accent)]/40 bg-[var(--n9-accent)]/[0.08] text-[var(--n9-accent)]"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-[var(--n9-accent)]/30 hover:text-foreground"
                }`}
              >
                <c.Icon className="h-3.5 w-3.5" weight="bold" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <span>Demo project.</span>
        <Link
          href="/auth/sign-up"
          className="group inline-flex items-center gap-1 font-semibold text-[var(--n9-accent)] hover:underline"
        >
          Put Catalyst to work on yours
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" weight="bold" />
        </Link>
      </div>
    </div>
  )
}
