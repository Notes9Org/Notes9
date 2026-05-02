"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PretextReveal } from "@/components/ui/fluid-text"
import { CatalystWorkspaceMockup } from "@/components/marketing/catalyst-workspace-mockup"
import { HeroMoleculeField } from "@/components/marketing/hero-molecule-field"

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

function BackgroundGlows() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-10%] h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[var(--n9-accent)]/[0.07] blur-[120px] animate-[drift_20s_ease-in-out_infinite]" />
      <div className="absolute right-[-10%] top-[20%] h-[400px] w-[500px] rounded-full bg-emerald-500/[0.06] blur-[100px] animate-[drift_25s_ease-in-out_infinite_reverse]" />
      <div className="absolute bottom-[10%] left-[-5%] h-[350px] w-[450px] rounded-full bg-[var(--n9-accent)]/[0.05] blur-[100px] animate-[drift_22s_ease-in-out_infinite_2s]" />
    </div>
  )
}

function FooterStrip() {
  return (
    <div className="relative z-[1] mt-auto shrink-0 border-t border-border/25 pt-6">
      <div className="mx-auto flex max-w-4xl items-center justify-center px-0 pb-2">
        <p className="text-center text-sm text-muted-foreground/95 text-pretty sm:text-base">
          For researchers tired of scattered papers, notes, protocols, spreadsheets, and disconnected AI tools.
        </p>
      </div>
    </div>
  )
}

/** Product mockup: Catalyst AI workspace (HTML/CSS replica). */
function HeroSolutionMockup() {
  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[60rem] flex-1 flex-col sm:max-w-[70rem] lg:mx-0 lg:max-w-none">
      <div className="flex min-h-0 flex-1 flex-col rounded-[28px] bg-gradient-to-br from-[var(--n9-accent)]/45 via-emerald-950/22 to-[var(--n9-accent)]/35 p-[3px] shadow-[0_28px_90px_-52px_rgba(34,70,40,0.2)] dark:from-[var(--n9-accent)]/40 dark:via-emerald-900/18 dark:to-[var(--n9-accent)]/32 dark:shadow-[0_32px_100px_-52px_rgba(0,0,0,0.65)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[25px] border border-[var(--n9-accent)]/18 bg-[radial-gradient(circle,rgba(0,0,0,0.055)_1px,transparent_1px)] [background-size:20px_20px] ring-1 ring-black/[0.04] dark:border-[var(--n9-accent)]/16 dark:bg-[radial-gradient(circle,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(180deg,rgba(22,28,24,0.98),rgba(10,14,12,0.995))] dark:[background-size:20px_20px,auto] dark:ring-white/[0.06]">
          <CatalystWorkspaceMockup />
        </div>
      </div>
    </div>
  )
}

function HeroCopyStack({
  reduceMotion,
  subWord,
}: {
  reduceMotion: boolean
  subWord: (typeof SUB_HERO_WORDS)[number]
}) {
  return (
    <div className="mx-auto grid w-full max-w-[min(100%,96rem)] items-stretch gap-10 lg:grid-cols-[minmax(0,1.14fr)_minmax(0,1.06fr)] lg:gap-6 xl:gap-7 2xl:gap-8">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.15, ease: "easeOut" }}
        className="mx-auto flex min-h-0 w-full max-w-4xl flex-col text-center lg:mx-0 lg:h-full lg:max-w-none lg:justify-center lg:text-left"
      >
        <div className="space-y-7">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center lg:justify-start"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--n9-accent)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--n9-accent)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--n9-accent)]" />
            </span>
            AI-native workspace for scientists
          </span>
        </motion.div>

        <div className="academic-hero-serif-headline text-4xl font-normal tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem] lg:leading-[1.07] xl:text-[3.45rem]">
          <PretextReveal text="Do the science.
          Let AI do the grunt work." />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto w-full max-w-4xl text-[1.6875rem] leading-relaxed text-muted-foreground sm:text-[1.875rem] sm:leading-relaxed lg:mx-0"
        >
          {reduceMotion ? (
            <p className="text-pretty">
              <span className="text-muted-foreground">One place for your </span>
              <span className="font-medium text-[var(--n9-accent)]">Literature search</span>
              <span className="text-muted-foreground">.</span>
            </p>
          ) : (
            <p className="flex flex-wrap items-baseline justify-center gap-x-1.5 text-pretty sm:flex-nowrap sm:gap-x-2 lg:justify-start">
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
          className="flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start"
        >
          <Button
            asChild
            size="lg"
            className="group h-12 rounded-full bg-[var(--n9-accent)] px-8 text-primary-foreground shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] transition-all duration-300 hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_20px_50px_-12px_var(--n9-accent-glow)]"
          >
            <Link href="/#contact">
              Try for free
              <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-full border-border/60 px-8 transition-colors duration-200 hover:border-[var(--n9-accent)]/40"
          >
            <Link href="/#contact">
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
              Request a demo
            </Link>
          </Button>
        </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.28, ease: "easeOut" }}
        className="flex h-full min-h-0 min-w-0 flex-col"
      >
        <HeroSolutionMockup />
      </motion.div>
    </div>
  )
}

function AcademicHeroSection({
  subWord,
  reduceMotion,
}: {
  subWord: (typeof SUB_HERO_WORDS)[number]
  reduceMotion: boolean
}) {
  return (
    <section className="marketing-section-accent relative flex w-full min-w-0 max-w-full flex-col overflow-visible pt-16">
      <BackgroundGlows />
      <HeroMoleculeField reduceMotion={reduceMotion} />
      <div className="relative z-10 flex min-h-[calc(100svh-4rem)] flex-col px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col py-4 sm:py-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
            <div className="relative z-[1] min-w-0">
              <HeroCopyStack reduceMotion={reduceMotion} subWord={subWord} />
            </div>
          </div>
          <FooterStrip />
        </div>
      </div>
    </section>
  )
}

export function AcademicHero() {
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

  return <AcademicHeroSection subWord={subWord} reduceMotion={!!reduceMotion} />
}
