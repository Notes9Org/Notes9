"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Sparkle as Sparkles } from "@phosphor-icons/react/ssr"
import { HeroSearch } from "@/components/marketing/hero-search"
import { cn } from "@/lib/utils"

/** House easing — matches `--n9-ease`. */
const EASE = [0.22, 1, 0.36, 1] as const

/* Shared bits so the three options differ in structure, not in furniture. */

function Field() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="n9-grid-fine" />
      <div className="n9-organic n9-organic-mask" />
      <div className="n9-grain-overlay" />
      <div className="n9-vignette" />
    </div>
  )
}

function Headline({ align = "center" }: { align?: "center" | "left" }) {
  return (
    <h1
      className={cn(
        "font-serif tracking-[-0.03em] text-[clamp(2.3rem,5.4vw,4.4rem)] leading-[1.02]",
        align === "center" && "text-center"
      )}
    >
      <span className="block text-foreground">AI that answers from</span>
      <span className="block text-muted-foreground">your lab&apos;s actual work.</span>
    </h1>
  )
}

function Actions({ align = "center" }: { align?: "center" | "left" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        align === "center" && "justify-center"
      )}
    >
      <Link
        href="/auth/sign-up"
        className="n9-press inline-flex h-12 items-center gap-2 rounded-full bg-[var(--n9-accent)] px-7 text-[15px] font-semibold text-white shadow-[0_14px_44px_-12px_var(--n9-accent-glow)] transition-colors hover:bg-[var(--n9-accent-hover)]"
      >
        Start free
        <ArrowRight className="size-4" aria-hidden />
      </Link>
      <Link
        href="/how-it-works"
        className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-background/60 px-6 text-[15px] font-semibold text-foreground backdrop-blur transition-colors hover:bg-muted"
      >
        See how it works
      </Link>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Option A — one large app window, tilted
   ═══════════════════════════════════════════════════════════════════════════
   The Linear / Framer / Vercel register: say it plainly, then show the whole
   product at size on a slight perspective tilt. Conventional, but conventional
   because it works — the app is the proof and nothing competes with it.
   ═══════════════════════════════════════════════════════════════════════════ */

export function HeroOptionA() {
  return (
    <section className="relative isolate overflow-hidden pb-0 pt-14 sm:pt-20">
      <Field />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="n9-label">The connected research workspace</p>
          <div className="mt-6">
            <Headline />
          </div>
          <p className="mt-5 max-w-lg text-[16px] leading-7 text-foreground/75">
            Every paper, protocol, result and note stays linked. Ask Catalyst anything and
            it answers from that record — and cites it.
          </p>
          <div className="mt-8 w-full max-w-lg">
            <HeroSearch />
          </div>
          <div className="mt-6">
            <Actions />
          </div>
        </div>

        {/* Whole-app window, tilted and cropped at the bottom. */}
        <div className="mx-auto mt-14 max-w-6xl [perspective:2200px]">
          <div className="origin-top [transform:rotateX(7deg)]">
            <div className="overflow-hidden rounded-t-2xl border border-border/60 shadow-[0_-8px_140px_-40px_var(--n9-accent-glow),0_60px_120px_-50px_rgba(44,36,24,0.5)] [mask-image:linear-gradient(to_bottom,#000_70%,transparent_99%)]">
              <img
                src="/demo/light/catalyst-protocol.png"
                alt="The Notes9 workspace with Catalyst drafting a protocol"
                className="block w-full dark:hidden"
              />
              <img
                src="/demo/dark/catalyst-protocol.png"
                alt=""
                aria-hidden
                className="hidden w-full dark:block"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Option B — real UI fragments, connected
   ═══════════════════════════════════════════════════════════════════════════
   The constellation, but every card is an actual crop of the running product
   (see public/demo/fragments): a rendered protocol document, the Plotly
   standard curve, a real paper card, Catalyst's tool calls. Cropping real UI
   rather than mocking cards is the difference between showing the product and
   describing it.
   ═══════════════════════════════════════════════════════════════════════════ */

type Frag = { id: string; src: string; label: string; x: number; y: number; w: string; delay: number }

const FRAGS: Frag[] = [
  { id: "paper", src: "frag-paper", label: "Literature", x: 10, y: 16, w: "20rem", delay: 0 },
  { id: "protocol", src: "frag-protocol", label: "Protocol", x: 90, y: 17, w: "19rem", delay: 1.1 },
  { id: "chart", src: "frag-chart", label: "Data", x: 8, y: 60, w: "18rem", delay: 2.2 },
  { id: "catalyst", src: "frag-catalyst", label: "Catalyst", x: 91, y: 62, w: "20rem", delay: 3.3 },
]

const CENTRE = { x: 50, y: 44 }

export function HeroOptionB() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="relative isolate overflow-hidden py-14 sm:py-20">
      <Field />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto min-h-[34rem] max-w-6xl lg:min-h-[44rem] lg:max-w-[92rem]">
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
          >
            {FRAGS.map((f, i) => {
              const d = `M ${f.x} ${f.y} Q ${(f.x + CENTRE.x) / 2} ${(f.y + CENTRE.y) / 2 + 4} ${CENTRE.x} ${CENTRE.y}`
              return (
                <g key={f.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--n9-accent)"
                    strokeOpacity={0.3}
                    strokeWidth={0.22}
                    vectorEffect="non-scaling-stroke"
                  />
                  {!reduceMotion && (
                    <motion.path
                      d={d}
                      fill="none"
                      stroke="var(--n9-accent)"
                      strokeOpacity={0.8}
                      strokeWidth={0.42}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      initial={{ pathLength: 0.07, pathOffset: 0 }}
                      animate={{ pathOffset: [0, 0.93] }}
                      transition={{ duration: 3.4, ease: "linear", repeat: Infinity, delay: i * 0.8 }}
                    />
                  )}
                </g>
              )
            })}
          </svg>

          {FRAGS.map((f) => (
            <motion.div
              key={f.id}
              className="absolute z-10 hidden lg:block"
              style={{
                left: `${f.x}%`,
                top: `${f.y}%`,
                width: f.w,
                translateX: "-50%",
                translateY: "-50%",
              }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: EASE, delay: reduceMotion ? 0 : 0.3 + f.delay * 0.1 }}
            >
              <motion.div
                animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                transition={{ duration: 10, ease: "easeInOut", repeat: Infinity, delay: f.delay }}
              >
                <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="size-1.5 rounded-[1px] bg-[var(--n9-accent)]" />
                  {f.label}
                </p>
                {/* Real UI, cropped from a real capture. */}
                <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_24px_60px_-28px_rgba(44,36,24,0.45)]">
                  <img
                    src={`/demo/fragments/${f.src}.png`}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="block w-full"
                  />
                </div>
              </motion.div>
            </motion.div>
          ))}

          <div className="relative z-20 mx-auto flex max-w-xl flex-col items-center px-2 py-8 text-center lg:py-20">
            <p className="n9-label">The connected research workspace</p>
            <div className="mt-6">
              <Headline />
            </div>
            <p className="mt-5 max-w-md text-[16px] leading-7 text-foreground/75">
              Every paper, protocol, result and note stays linked — and Catalyst answers
              from all of it.
            </p>
            <div className="mt-8 w-full max-w-lg">
              <HeroSearch />
            </div>
            <div className="mt-6">
              <Actions />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Option C — question → answer
   ═══════════════════════════════════════════════════════════════════════════
   Shows the job rather than the software. A real question on the left; on the
   right the answer assembles, with citation chips naming the records it came
   from. The most literal demonstration of the value, and the only option that
   works without the reader knowing what an ELN is.
   ═══════════════════════════════════════════════════════════════════════════ */

const STEPS = ["Reading your protocols…", "Found: Transfection screen — PEI:DNA ratios", "Checking the saved literature…"]
const CITES = ["Lab note · 12 Mar", "Transfection screen", "Backliwal 2008"]

export function HeroOptionC() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="relative isolate overflow-hidden py-14 sm:py-20">
      <Field />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="n9-label">The connected research workspace</p>
            <div className="mt-6">
              <Headline align="left" />
            </div>
            <p className="mt-5 max-w-md text-[16px] leading-7 text-foreground/75">
              Every paper, protocol, result and note stays linked. Ask Catalyst anything and
              it answers from that record — and cites it.
            </p>
            <div className="mt-8 max-w-lg">
              <HeroSearch />
            </div>
            <div className="mt-6">
              <Actions align="left" />
            </div>
          </div>

          {/* The answer, mid-assembly. */}
          <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-[0_40px_110px_-45px_rgba(44,36,24,0.5)] backdrop-blur-xl sm:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Asked of a real project
            </p>
            <p className="mt-4 font-serif text-[20px] leading-snug text-foreground">
              &ldquo;Why did we move to the 3:1 PEI ratio?&rdquo;
            </p>

            <div className="mt-6 space-y-2">
              {STEPS.map((s, i) => (
                <motion.p
                  key={s}
                  initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: reduceMotion ? 0 : 0.3 + i * 0.35 }}
                  className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"
                >
                  <Sparkles className="size-3 text-[var(--n9-accent)]" aria-hidden />
                  {s}
                </motion.p>
              ))}
            </div>

            <hr className="my-6 border-0 border-t border-border/60" />

            <motion.p
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE, delay: reduceMotion ? 0 : 1.5 }}
              className="text-[15px] leading-7 text-foreground"
            >
              Condition B (3:1) gave the highest transient yield in the ratio screen. Higher
              ratios raised cytotoxicity without improving yield, matching the ratio
              reported in the saved literature.
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: reduceMotion ? 0 : 2 }}
              className="mt-5 flex flex-wrap gap-2"
            >
              {CITES.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 font-mono text-[10px] tracking-wide text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
