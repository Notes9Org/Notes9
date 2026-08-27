"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CaretDown, Info, Question } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { AutoChoice, ChoiceOrigin } from "@/lib/data-analysis/auto-choices"
import { EASE_OUT } from "./motion"

/**
 * The decisions Notes9 made on the researcher's behalf, with the reasoning.
 *
 * Attaching a file produces a chart with axes chosen, a test selected and
 * columns assigned roles — none of it asked for, all of it consequential. The
 * reasoning existed and was discarded (see `auto-choices.ts`); this is where it
 * comes back. Collapsed by default and summarised in one line, because it is a
 * record to be checked rather than another thing to dismiss before working.
 */

const ORIGIN_LABEL: Record<ChoiceOrigin, string> = {
  inferred: "Notes9 chose this",
  user: "You chose this",
  record: "From the experiment record",
}

const ORIGIN_CLASS: Record<ChoiceOrigin, string> = {
  inferred: "bg-muted text-muted-foreground",
  user: "bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]",
  record: "bg-muted text-muted-foreground",
}

export function AutoChoicesPanel({
  choices,
  onOpenHelp,
}: {
  choices: AutoChoice[]
  /** Opens the help centre at the statistics section. */
  onOpenHelp?: () => void
}) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)

  if (choices.length === 0) return null

  const test = choices.find((c) => c.id === "test")
  const x = choices.find((c) => c.id === "axis-x")
  const ys = choices.filter((c) => c.id.startsWith("axis-y:"))

  // The one-line version: the two things a researcher checks first.
  const summary = [
    x ? `${x.choice}${ys.length ? ` vs ${ys.map((y) => y.choice).join(", ")}` : ""}` : null,
    test ? test.choice : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="border-b border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-[12.5px]">
          <span className="font-medium">Chosen for you:</span>{" "}
          <span className="text-muted-foreground">{summary || "see the reasoning"}</span>
        </span>
        <span className="shrink-0 text-[11.5px] text-muted-foreground">
          {open ? "Hide" : "Why?"}
        </span>
        <CaretDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <ul className="space-y-1.5 px-4 pb-3">
              {choices.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-border/70 bg-background px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {c.what}
                    </span>
                    <span className="text-[12.5px] font-semibold">{c.choice}</span>
                    {c.where && (
                      <span className="rounded bg-muted px-1 font-mono text-[10.5px] font-semibold">
                        {c.where}
                      </span>
                    )}
                    <span
                      className={cn(
                        "ml-auto rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                        ORIGIN_CLASS[c.origin]
                      )}
                    >
                      {ORIGIN_LABEL[c.origin]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    {c.why}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              <p className="flex-1 text-[11.5px] text-muted-foreground">All overridable.</p>
              {onOpenHelp && (
                <button
                  type="button"
                  onClick={onOpenHelp}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-medium transition-colors hover:bg-muted"
                >
                  <Question className="h-3.5 w-3.5" />
                  Explain
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
