"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { ArrowRight, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConnectedResearchSystemDiagram } from "@/components/marketing/connected-research-system-diagram"
import { HeroMolecules } from "@/components/marketing/hero-molecules"
import { PretextReveal } from "@/components/ui/fluid-text"

const SUB_HERO_WORDS = [
  "Literature search",
  "Protocol design",
  "Experiment planning",
  "Lab notes",
  "Data analysis",
  "Reports & Publications",
] as const

const SUB_HERO_INTERVAL_MS = 4200

/** Longest rotating line — reserves width/height so swaps stay stable. */
const SUB_HERO_LAYOUT_ANCHOR = SUB_HERO_WORDS.reduce((a, b) =>
  a.length >= b.length ? a : b,
)

export function AcademicHero() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [subHeroIndex, setSubHeroIndex] = useState(0)
  const subHeroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const subWordCount = SUB_HERO_WORDS.length

  const advanceSubHero = () => {
    setSubHeroIndex((i) => (i + 1) % subWordCount)
  }

  useEffect(() => {
    if (reduceMotion) return
    if (subHeroTimerRef.current) clearTimeout(subHeroTimerRef.current)
    subHeroTimerRef.current = setTimeout(advanceSubHero, SUB_HERO_INTERVAL_MS)
    return () => {
      if (subHeroTimerRef.current) clearTimeout(subHeroTimerRef.current)
    }
  }, [subHeroIndex, reduceMotion, subWordCount])

  const subWord = SUB_HERO_WORDS[subHeroIndex % subWordCount] ?? SUB_HERO_WORDS[0]

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 40])

  return (
    <section ref={sectionRef} className="relative overflow-x-clip overflow-y-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[var(--n9-accent)]/[0.07] blur-[120px] animate-[drift_20s_ease-in-out_infinite]" />
        <div className="absolute right-[-10%] top-[20%] h-[400px] w-[500px] rounded-full bg-amber-600/[0.04] blur-[100px] animate-[drift_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute left-[-5%] bottom-[10%] h-[350px] w-[450px] rounded-full bg-[var(--n9-accent)]/[0.05] blur-[100px] animate-[drift_22s_ease-in-out_infinite_2s]" />
      </div>
      <HeroMolecules />

      <div className="container relative z-10 mx-auto px-4 pt-8 sm:px-6 sm:pt-14 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.15, ease: "easeOut" }}
          style={{ y: heroY }}
          className="mt-4 grid w-full min-w-0 items-start gap-8 lg:mt-10 lg:grid-cols-2 lg:gap-10 xl:grid-cols-[5fr_7fr] xl:gap-12"
        >
          <div className="order-2 min-w-0 space-y-7 lg:order-1 lg:pt-2 xl:pt-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex justify-start"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--n9-accent)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--n9-accent)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--n9-accent)]" />
                </span>
                Built for life-science research teams
              </span>
            </motion.div>

            <div className="max-w-3xl text-left font-serif text-4xl tracking-tight text-foreground sm:text-5xl lg:text-[3.45rem] lg:leading-[1.07]">
              <PretextReveal text="Where research stays connected, and AI catalyzes it." />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="max-w-2xl text-left text-[1.6875rem] leading-relaxed text-muted-foreground sm:text-[1.875rem] sm:leading-relaxed"
            >
              {reduceMotion ? (
                <p className="text-pretty">
                  <span className="text-muted-foreground">One place for your </span>
                  <span className="font-medium text-[var(--n9-accent)]">
                    Literature search
                  </span>
                  <span className="text-muted-foreground">.</span>
                </p>
              ) : (
                <p className="text-pretty flex flex-wrap items-baseline gap-x-1">
                  <span className="shrink-0 text-muted-foreground">One place for your </span>
                  <span className="inline-grid min-w-0 max-w-full grid-cols-1 grid-rows-1 align-baseline leading-snug">
                    <span
                      className="invisible col-start-1 row-start-1 max-w-full font-medium leading-snug"
                      aria-hidden
                    >
                      {SUB_HERO_LAYOUT_ANCHOR}
                    </span>
                    <span className="relative col-start-1 row-start-1 max-w-full min-h-0 self-stretch overflow-hidden">
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={subWord}
                          initial={{ y: "100%", opacity: 0 }}
                          animate={{ y: "0%", opacity: 1 }}
                          exit={{ y: "-100%", opacity: 0 }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                          className="absolute left-0 top-0 block max-w-full font-medium leading-snug text-[var(--n9-accent)]"
                        >
                          {subWord}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </span>
                </p>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col items-start gap-4 sm:flex-row"
            >
              <Button
                asChild
                size="lg"
                className="group h-12 rounded-full bg-[var(--n9-accent)] px-8 text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] transition-all duration-300 hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_20px_50px_-12px_var(--n9-accent-glow)]"
              >
                <Link href="/#contact">
                  Request a demo
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-border/60 px-8 transition-colors duration-200 hover:border-[var(--n9-accent)]/40"
              >
                <Link href="/platform">
                  <Play className="mr-2 h-4 w-4" />
                  See how it works
                </Link>
              </Button>
            </motion.div>
          </div>

          <div className="order-1 min-w-0 lg:order-2">
            {/* Same diagram chrome + layout as PlatformDifferentiationSection (flow lane + rail + hub). */}
            <ConnectedResearchSystemDiagram className="w-full min-w-0" />
          </div>
        </motion.div>

      </div>

      <div className="h-20">
        <div className="container mx-auto flex h-full items-center px-4 sm:px-6 lg:px-8">
          <p className="max-w-4xl text-sm text-muted-foreground/95 sm:text-base">
            For researchers tired of scattered papers, notes, protocols, spreadsheets, and disconnected AI tools.
          </p>
        </div>
      </div>
    </section>
  )
}

