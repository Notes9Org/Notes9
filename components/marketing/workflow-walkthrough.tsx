"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BrowserFrame } from "@/components/marketing/browser-frame"
import { cn } from "@/lib/utils"

/** House easing — matches `--n9-ease` and the marketing EASE_OUT constant. */
const EASE = [0.22, 1, 0.36, 1] as const

type WorkflowStepSpec = {
  label: string
  title: string
  description: string
  /** Base filename present in both /public/demo/light and /public/demo/dark. */
  screenshot: string
  alt: string
}

/**
 * The five moves of a research cycle, in the order they actually happen. Each
 * one is a real screen in the product — no mockups, no aspirational UI.
 */
const STEPS: WorkflowStepSpec[] = [
  {
    label: "Ask",
    title: "Start from the literature",
    description:
      "Ask a research question in plain language. Notes9 searches PubMed, Europe PMC and OpenAlex, summarises what it finds, and saves the papers that matter into your library — with the PDFs attached.",
    screenshot: "literature-search",
    alt: "Notes9 literature search showing an AI overview above cited results",
  },
  {
    label: "Plan",
    title: "Turn reading into a protocol",
    description:
      "Write the method down once as a versioned protocol. Every change is tracked, so six months later you can see exactly which version produced which result.",
    screenshot: "protocol-details",
    alt: "A versioned protocol open in the Notes9 protocol editor",
  },
  {
    label: "Run",
    title: "Record the experiment as you go",
    description:
      "Experiments hold your steps, samples, data files and lab notes together. Notes autosave as drafts and commit into a version history you can diff.",
    screenshot: "experiment-details",
    alt: "A Notes9 experiment page with its steps, samples and notes tabs",
  },
  {
    label: "Analyse",
    title: "Get from raw numbers to a figure",
    description:
      "Drop in a spreadsheet and build the figure: t-tests and ANOVA with post-hoc correction, dose–response curves, plate maps — exported at publication DPI.",
    screenshot: "project-report",
    alt: "A Notes9 report showing generated charts alongside written analysis",
  },
  {
    label: "Publish",
    title: "Write it up with your work in reach",
    description:
      "Draft the manuscript alongside the notes and citations it came from. Export to DOCX or LaTeX when you are ready to submit.",
    screenshot: "writing-editor",
    alt: "The Notes9 manuscript editor with a citation panel open",
  },
]

/**
 * Sequence-style numbered step rail: picking a step swaps the screenshot below
 * it. One screenshot at a time keeps each screen large enough to actually read,
 * which a grid of five thumbnails cannot do.
 */
export function WorkflowWalkthrough() {
  const [active, setActive] = useState(0)
  const reduceMotion = useReducedMotion()
  const step = STEPS[active]

  return (
    <div>
      {/* Step rail — horizontally scrollable on small screens rather than
          wrapping, so the numbered sequence still reads as a sequence. */}
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex min-w-max gap-2 sm:min-w-0 sm:grid sm:grid-cols-5 sm:gap-3">
          {STEPS.map((s, i) => {
            const isActive = i === active
            return (
              <li key={s.label} className="w-44 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-current={isActive ? "step" : undefined}
                  className="group w-full text-left"
                >
                  <span className="relative flex h-0.5 w-full overflow-hidden rounded-full bg-border">
                    <motion.span
                      className="absolute inset-y-0 left-0 rounded-full bg-[var(--n9-accent)]"
                      initial={false}
                      animate={{ width: isActive ? "100%" : "0%" }}
                      transition={{ duration: 0.42, ease: EASE }}
                    />
                  </span>
                  <span className="mt-3 flex items-baseline gap-2">
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums transition-colors",
                        isActive ? "text-[var(--n9-accent)]" : "text-muted-foreground"
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold transition-colors",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-center lg:gap-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`copy-${active}`}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <h3 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
              {step.title}
            </h3>
            <p className="mt-3 text-[16px] leading-7 text-muted-foreground sm:text-[17px]">
              {step.description}
            </p>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`shot-${active}`}
            initial={reduceMotion ? false : { opacity: 0, y: 20, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <BrowserFrame src={step.screenshot} alt={step.alt} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
