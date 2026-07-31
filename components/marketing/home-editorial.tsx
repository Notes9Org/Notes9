"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Plus, Check, X } from "@phosphor-icons/react/ssr"
import { BrowserFrame } from "@/components/marketing/browser-frame"
import { cn } from "@/lib/utils"

/** House easing, matches `--n9-ease`. */
const EASE = [0.22, 1, 0.36, 1] as const

/* ═══════════════════════════════════════════════════════════════════════════
   Proof band
   ═══════════════════════════════════════════════════════════════════════════
   Three sourced figures. Every number here is attributable, the brand's
   proof-and-claims rule forbids unsourced statistics, so each carries its
   citation inline rather than in a distant footnote.
   ═══════════════════════════════════════════════════════════════════════════ */

const STATS = [
  {
    figure: "84%",
    claim: "of researchers already use AI in their work",
    source: "Wiley ExplanAItions, 2025",
  },
  {
    figure: "7%",
    claim: "trust it enough to rely on for research decisions",
    source: "Elsevier, Researcher of the Future, 2025",
  },
  {
    figure: "77%",
    claim: "of biologists have failed to reproduce another lab's experiment",
    source: "Baker, Nature 533:452, 2016",
  },
]

export function ProofBand() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="border-t border-border/50">
      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STATS.map((s, i) => (
            <motion.div
              key={s.figure}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, ease: EASE, delay: reduceMotion ? 0 : i * 0.08 }}
            >
              <hr className="n9-hairline mb-6" />
              <p className="font-serif text-[clamp(2.6rem,6vw,4rem)] leading-none tracking-tight text-[var(--n9-accent)]">
                {s.figure}
              </p>
              <p className="mt-4 max-w-xs text-[15px] leading-6 text-foreground">{s.claim}</p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">
                {s.source}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="mt-14 max-w-2xl font-serif text-[clamp(1.5rem,3.2vw,2.2rem)] leading-[1.25] tracking-tight text-foreground">
          The gap isn&apos;t capability. It&apos;s context. General models have never seen
          your data, so nothing they say can be checked.
        </p>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Fracture: before / after
   ═══════════════════════════════════════════════════════════════════════════
   The V7 device: a deliberately flat, colourless "today" panel beside a warm,
   saturated "with Notes9" panel. The contrast does the argument's work before
   any of the copy is read.
   ═══════════════════════════════════════════════════════════════════════════ */

const TODAY = [
  "Protocols live in a shared drive nobody trusts",
  "Results sit in spreadsheets on one laptop",
  "Why a condition was dropped is in someone's head",
  "Every AI conversation starts by re-explaining the project",
]

const WITH_NOTES9 = [
  "Protocols versioned, with the literature that justified them",
  "Data attached to the experiment that produced it",
  "Decisions recorded where the work happened",
  "Catalyst answers from your record, with citations",
]

export function FractureSection() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="border-t border-border/50">
      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="n9-label">The problem</p>
        <h2 className="mt-6 max-w-3xl font-serif text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.06] tracking-[-0.02em] text-foreground">
          Your work is already connected. Your tools are not.
        </h2>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <Panel
            label="Today"
            title="Four tools, none of which know about each other."
            items={TODAY}
            tone="cold"
            reduceMotion={reduceMotion}
          />
          <Panel
            label="With Notes9"
            title="One record, and an assistant that has read all of it."
            items={WITH_NOTES9}
            tone="warm"
            reduceMotion={reduceMotion}
          />
        </div>
      </div>
    </section>
  )
}

function Panel({
  label,
  title,
  items,
  tone,
  reduceMotion,
}: {
  label: string
  title: string
  items: string[]
  tone: "cold" | "warm"
  reduceMotion: boolean | null
}) {
  const warm = tone === "warm"
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.65, ease: EASE, delay: warm && !reduceMotion ? 0.12 : 0 }}
      className={cn(
        "relative overflow-hidden rounded-[26px] border p-7 sm:p-9",
        warm
          ? "border-[var(--n9-accent)]/25 shadow-[0_40px_120px_-52px_var(--n9-accent-glow)]"
          : "border-border/70 bg-muted/35"
      )}
    >
      {warm && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(150deg,color-mix(in_oklab,var(--n9-accent)_16%,transparent),transparent_58%),linear-gradient(320deg,color-mix(in_oklab,#c9a227_12%,transparent),transparent_54%)]"
        />
      )}

      <p className={cn("n9-label", !warm && "opacity-70")}>{label}</p>
      <h3
        className={cn(
          "mt-5 max-w-sm font-serif text-[22px] leading-[1.25] tracking-tight sm:text-[26px]",
          warm ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {title}
      </h3>

      <ul className="mt-7 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                warm
                  ? "bg-[var(--n9-accent)] text-white"
                  : "bg-background text-muted-foreground ring-1 ring-border"
              )}
            >
              {warm ? (
                <Check className="size-3" weight="bold" aria-hidden />
              ) : (
                <X className="size-3" aria-hidden />
              )}
            </span>
            <span
              className={cn(
                "text-[15px] leading-6",
                warm ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   The chain: numbered accordion
   ═══════════════════════════════════════════════════════════════════════════
   IntegratedBio's numbered-accordion device, carrying a real screenshot in the
   expanded panel. One row open at a time keeps the screen large enough to read
   and makes the sequence legible as a sequence.
   ═══════════════════════════════════════════════════════════════════════════ */

const CHAIN = [
  {
    n: "01",
    title: "Literature",
    body: "Ask a research question in plain language. Notes9 searches PubMed, Europe PMC and OpenAlex, summarises what comes back, and files the papers that matter with their PDFs attached.",
    shot: "literature-search",
    alt: "Notes9 literature search with an AI overview above cited results",
  },
  {
    n: "02",
    title: "Protocols",
    body: "Ask Catalyst to draft it and it works from the protocols already in your workspace. Everything is versioned, so six months later you can still see which version produced which result.",
    shot: "catalyst-protocol",
    alt: "Catalyst drafting an ELISA protocol: it finds the existing protocol in the workspace, reads it, and streams a section-by-section outline",
  },
  {
    n: "03",
    title: "Experiments",
    body: "Steps, samples, data files and lab notes held together. Notes autosave as drafts and commit into a history you can diff line by line.",
    shot: "experiment-details",
    alt: "A Notes9 experiment with its steps, samples and notes tabs",
  },
  {
    n: "04",
    title: "Analysis",
    body: "Drop in a spreadsheet and build the figure: t-tests and ANOVA with post-hoc correction, dose–response curves, plate maps, exported at publication DPI.",
    shot: "data-analysis",
    alt: "The Notes9 data workspace: a spreadsheet of ELISA readings beside a fitted standard curve",
  },
  {
    n: "05",
    title: "Writing",
    body: "Draft the manuscript beside the notes and citations it came from. Export to DOCX or LaTeX when you're ready to submit.",
    shot: "writing-editor",
    alt: "The Notes9 manuscript editor with a citation panel open",
  },
]

export function ChainSection() {
  const [open, setOpen] = useState(0)
  const reduceMotion = useReducedMotion()

  return (
    <section className="border-t border-border/50">
      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="n9-label">The chain</p>
            <h2 className="mt-6 max-w-2xl font-serif text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.06] tracking-[-0.02em] text-foreground">
              Every step writes a link to the last.
            </h2>
          </div>
          <p className="max-w-xs text-[15px] leading-6 text-muted-foreground">
            That chain is what makes an answer checkable, and what an ELN throws away.
          </p>
        </div>

        <div className="mt-14">
          {CHAIN.map((row, i) => {
            const isOpen = i === open
            return (
              <div key={row.n} className="border-t border-border/60 last:border-b">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="group flex w-full items-center gap-5 py-6 text-left sm:gap-8"
                >
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums transition-colors",
                      isOpen ? "text-[var(--n9-accent)]" : "text-muted-foreground/60"
                    )}
                  >
                    {row.n}
                  </span>
                  <span
                    className={cn(
                      "flex-1 font-serif text-[clamp(1.6rem,3.6vw,2.6rem)] leading-tight tracking-tight transition-colors",
                      isOpen
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {row.title}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-[var(--n9-accent)]/40 group-hover:text-foreground"
                  >
                    <Plus className="size-4" aria-hidden />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                      /* Height and opacity on separate curves. Fading the
                         content in over the same 0.42s as the box meant the
                         screenshot was already fully visible while the row was
                         still growing, which reads as a pop rather than an
                         open. Opacity now trails the height on the way in and
                         leads it on the way out, so the box is always the thing
                         you watch move. */
                      transition={{
                        height: { duration: 0.44, ease: EASE },
                        opacity: { duration: 0.24, ease: EASE, delay: isOpen ? 0.14 : 0 },
                      }}
                      className="overflow-hidden"
                      style={{ willChange: "height" }}
                    >
                      <motion.div
                        initial={reduceMotion ? false : { y: 8 }}
                        animate={{ y: 0 }}
                        exit={reduceMotion ? undefined : { y: 4 }}
                        transition={{ duration: 0.36, ease: EASE, delay: isOpen ? 0.08 : 0 }}
                        /* Two columns from `md`, and centred against each other.
                           The copy used to sit at the top of a row as tall as
                           the screenshot beside it, which left it stranded above
                           a lot of empty space; centring puts the sentence
                           opposite the middle of the image where the eye moves
                           between them. The text column is also given real room
                           — it was capped narrower than the column it lived in,
                           so it wrapped early while the space went unused. */
                        className="grid items-center gap-8 pb-10 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-10 lg:gap-14 lg:pl-[3.25rem]"
                      >
                        <p className="text-[15px] leading-7 text-muted-foreground">
                          {row.body}
                        </p>
                        <BrowserFrame src={row.shot} alt={row.alt} />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Catalyst: inverted band
   ═══════════════════════════════════════════════════════════════════════════
   The one dark moment on the page. Inversion is used sparingly and on purpose:
   it marks the product's centre of gravity and gives the scroll a change in
   temperature rather than a change in layout.
   ═══════════════════════════════════════════════════════════════════════════ */

export function CatalystBand() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="relative isolate overflow-hidden bg-[#1a1714] text-[#f5f0e8]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="n9-organic" />
      </div>

      <div className="container mx-auto px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center">
          <div>
            {/* Colours are set explicitly on every element in this band rather
                than inherited from the section. A global heading rule pins
                headings to `--foreground`, which is the light-theme charcoal,
                on this near-black background that rendered the headline all but
                invisible. */}
            <p className="n9-label !text-[#f5f0e8]/70">Meet Catalyst</p>
            <h2 className="mt-6 max-w-xl font-serif text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.06] tracking-[-0.02em] !text-[#f5f0e8]">
              Not a search box. An assistant that has read your lab.
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-7 text-[#f5f0e8]/75">
              Catalyst answers from your projects, notes and saved papers, and cites the
              record behind every claim, so you can open the source instead of trusting the
              summary.
            </p>

            <Link
              href="/auth/sign-up"
              className="n9-press mt-9 inline-flex h-11 items-center gap-2 rounded-full bg-[#f5f0e8] px-6 text-[15px] font-medium text-[#1a1714] transition-opacity hover:opacity-90"
            >
              Ask it about your work
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: EASE }}
            className="rounded-[26px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5f0e8]/45">
              Asked of a real project
            </p>
            <p className="mt-4 font-serif text-[19px] leading-snug">
              &ldquo;Why did we move to the 3:1 PEI ratio?&rdquo;
            </p>

            <hr className="my-6 border-0 border-t border-white/10" />

            <p className="text-[15px] leading-7 text-[#f5f0e8]/80">
              Condition B (3:1) gave the highest transient yield in the ratio screen. Higher
              ratios raised cytotoxicity without improving yield, matching the ratio reported
              in the saved literature.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {["Lab note · 12 Mar", "Transfection screen", "Backliwal 2008"].map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] tracking-wide text-[#f5f0e8]/70"
                >
                  {c}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Closing: oversized wordmark
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The page's single closing act.
 *
 * This used to be two sections stacked: a "start free" CTA under an oversized
 * wordmark, then a separate "Get in touch" block with the contact form. Back to
 * back they asked the same thing twice and the second heading read as a
 * duplicate of the first. Merged, the left column makes the closing argument and
 * carries both the self-serve CTAs and the direct contact details, the form sits
 * beside it on its own surface. The oversized wordmark that used to sign this
 * section off now lives in the footer, so the sign-off happens once, at the very
 * bottom of the page, rather than twice in the last two screens.
 *
 * The form arrives as `children` so this stays free of the contact form's
 * dependencies and the server page keeps ownership of what it renders.
 */
export function ClosingSection({ children }: { children?: ReactNode }) {
  return (
    <section
      id="contact"
      className="relative isolate scroll-mt-20 overflow-hidden border-t border-border/50"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="n9-organic n9-organic-mask opacity-60" />
      </div>

      <div className="container mx-auto px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-20">
          <div>
            <p className="n9-label">Get started</p>
            <h2 className="mt-6 max-w-xl font-serif text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.06] tracking-[-0.02em] text-foreground">
              Your whole career, from first protocol to published paper.
            </h2>
            <p className="mt-5 max-w-sm text-[15px] leading-7 text-muted-foreground">
              Answer three questions and Notes9 sets up a workspace matched to your field,
              with a sample project you can pull apart to see how it fits together.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/sign-up"
                className="n9-press inline-flex h-11 items-center gap-2 rounded-full bg-[var(--n9-accent)] px-6 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-[var(--n9-accent-hover)]"
              >
                Start free
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-6 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                See pricing
              </Link>
            </div>

            <hr className="n9-hairline mt-10" />

            <p className="mt-8 max-w-sm text-[15px] leading-7 text-muted-foreground">
              Or tell us what you are working on and how your group records it today, and
              we will show you how Notes9 would fit around it.
            </p>
            <div className="mt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Email
              </p>
              <a
                href="mailto:admin@notes9.com"
                className="mt-2 inline-block text-[17px] text-foreground underline-offset-4 transition-colors hover:text-[var(--n9-accent)] hover:underline"
              >
                admin@notes9.com
              </a>
            </div>
          </div>

          {children}
        </div>
      </div>
    </section>
  )
}
