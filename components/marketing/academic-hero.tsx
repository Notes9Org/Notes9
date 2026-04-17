"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useTheme } from "next-themes"
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion"
import { ArrowRight, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { resolveDemoScreenshot } from "@/components/marketing/demo-asset"
import { HeroMolecules } from "@/components/marketing/hero-molecules"

const heroSlides = [
  { word: "literature reviews", src: "/demo/literature-search.png", alt: "Notes9 literature search" },
  { word: "experiments", src: "/demo/experiment-details.png", alt: "Notes9 experiment capture" },
  { word: "lab memory", src: "/demo/lab-memory.png", alt: "Notes9 lab memory" },
  { word: "protocols", src: "/demo/protocol-details.png", alt: "Notes9 protocols" },
  { word: "AI writing", src: "/demo/writing-editor.png", alt: "Notes9 AI writing editor" },
  { word: "reports", src: "/demo/project-report.png", alt: "Notes9 project reporting" },
]

const INTERVAL = 3200

export function AcademicHero() {
  const { resolvedTheme } = useTheme()
  const sectionRef = useRef<HTMLElement>(null)
  const [index, setIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 70])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.97])

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % heroSlides.length), INTERVAL)
  }

  useEffect(() => {
    resetTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goTo = (i: number) => {
    setIndex(i)
    resetTimer()
  }

  const slide = heroSlides[index]

  // Build the visible stack: current + next 2 behind it
  const stack = [0, 1, 2].map((offset) => {
    const i = (index + offset) % heroSlides.length
    return heroSlides[i]
  })

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      {/* ── background ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[var(--n9-accent)]/[0.07] blur-[120px] animate-[drift_20s_ease-in-out_infinite]" />
        <div className="absolute right-[-10%] top-[20%] h-[400px] w-[500px] rounded-full bg-amber-600/[0.04] blur-[100px] animate-[drift_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute left-[-5%] bottom-[10%] h-[350px] w-[450px] rounded-full bg-[var(--n9-accent)]/[0.05] blur-[100px] animate-[drift_22s_ease-in-out_infinite_2s]" />
      </div>
      <HeroMolecules />

      <div className="container relative z-10 mx-auto px-4 pt-12 sm:px-6 sm:pt-20 lg:px-8">
        {/* mascot — pendulum oscillation at top center */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center mb-6"
        >
          <div className="relative" style={{ transformOrigin: "center top" }}>
            {/* soft glow */}
            <div className="absolute inset-0 scale-150 rounded-full bg-[var(--n9-accent)]/[0.06] blur-2xl" aria-hidden />
            <img
              src="/notes9-mascot-ui.png"
              alt=""
              aria-hidden
              className="hero-pendulum relative z-10 h-14 w-14 object-contain sm:h-[72px] sm:w-[72px]"
            />
          </div>
        </motion.div>

        {/* badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--n9-accent)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--n9-accent)]" />
            </span>
            Research workflow platform
          </span>
        </motion.div>

        {/* headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mx-auto mt-8 max-w-4xl text-center font-serif text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.15]"
        >
          <span className="block">One place for your</span>
          <span className="relative block h-[1.3em] overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={slide.word}
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute inset-x-0 text-[var(--n9-accent)]"
              >
                {slide.word}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.h1>

        {/* subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-muted-foreground sm:text-xl"
        >
          Literature, experiments, lab memory, and reporting — connected.
          So your team can focus on the science, not the search.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Button
            asChild
            size="lg"
            className="group h-12 rounded-full bg-[var(--n9-accent)] px-8 text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_20px_50px_-12px_var(--n9-accent-glow)] transition-all duration-300 cursor-pointer"
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
            className="h-12 rounded-full px-8 border-border/60 hover:border-[var(--n9-accent)]/40 transition-colors duration-200 cursor-pointer"
          >
            <Link href="/platform">
              <Play className="mr-2 h-4 w-4" />
              Explore the platform
            </Link>
          </Button>
        </motion.div>

        {/* social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mx-auto mt-8 flex items-center justify-center gap-6 text-center text-xs text-muted-foreground/70 sm:gap-8"
        >
          <span>Built for research labs</span>
          <span className="h-3 w-px bg-border" />
          <span>Free during beta</span>
        </motion.div>

        {/* ── card deck ── */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5, ease: "easeOut" }}
          style={{ y: heroY, scale: heroScale }}
          className="relative mx-auto mt-14 max-w-5xl"
        >
          {/* glow */}
          <div className="absolute -inset-6 rounded-3xl bg-gradient-to-b from-[var(--n9-accent)]/[0.08] via-[var(--n9-accent)]/[0.04] to-transparent blur-2xl" />

          {/* the stack */}
          <div className="relative" style={{ perspective: "1400px" }}>
            {/* Back card (3rd) — static peek */}
            <div
              className="absolute inset-0 z-0 hidden lg:block"
              style={{
                transform: "translateY(20px) scale(0.9)",
                opacity: 0.25,
                transition: "all 0.6s ease-out",
              }}
            >
              <ScreenshotCard
                src={resolveDemoScreenshot(stack[2].src, resolvedTheme)}
                alt={stack[2].alt}
              />
            </div>

            {/* Middle card (2nd) — static peek */}
            <div
              className="absolute inset-0 z-[1] hidden lg:block"
              style={{
                transform: "translateY(10px) scale(0.95)",
                opacity: 0.45,
                transition: "all 0.6s ease-out",
              }}
            >
              <ScreenshotCard
                src={resolveDemoScreenshot(stack[1].src, resolvedTheme)}
                alt={stack[1].alt}
              />
            </div>

            {/* Front card — shuffles to back, next card rises from behind */}
            <div className="relative z-[2]">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={slide.word}
                  initial={{
                    y: 10,
                    scale: 0.95,
                    opacity: 0.5,
                    zIndex: 0,
                  }}
                  animate={{
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    zIndex: 2,
                    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
                  }}
                  exit={{
                    y: 20,
                    scale: 0.9,
                    opacity: 0,
                    zIndex: 0,
                    transition: { duration: 0.5, ease: [0.55, 0, 1, 0.45] },
                  }}
                  style={{ transformOrigin: "center top" }}
                >
                  <ScreenshotCard
                    src={resolveDemoScreenshot(slide.src, resolvedTheme)}
                    alt={slide.alt}
                    isActive
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* dots */}
          <div className="mt-6 flex justify-center gap-1.5">
            {heroSlides.map((s, i) => (
              <button
                key={s.word}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  i === index
                    ? "w-8 bg-[var(--n9-accent)]"
                    : "w-1.5 bg-border hover:bg-muted-foreground/40"
                }`}
                aria-label={`Show ${s.word}`}
              />
            ))}
          </div>
        </motion.div>
      </div>

      <div className="h-20" />
    </section>
  )
}

/* ── reusable screenshot card ── */
function ScreenshotCard({
  src,
  alt,
  isActive = false,
}: {
  src: string
  alt: string
  isActive?: boolean
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-background ${
        isActive
          ? "border-border/50 shadow-[0_60px_120px_-40px_rgba(44,36,24,0.22)] dark:shadow-[0_60px_120px_-40px_rgba(0,0,0,0.65)]"
          : "border-border/30 shadow-[0_30px_60px_-30px_rgba(44,36,24,0.1)] dark:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.3)]"
      }`}
    >
      {/* browser bar */}
      <div className="flex h-9 items-center gap-2 border-b border-border/40 bg-muted/40 px-4">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="ml-3 flex h-5 flex-1 max-w-[200px] items-center justify-center rounded-md bg-muted/60 text-[10px] font-medium text-muted-foreground/50">
          notes9.com
        </div>
      </div>
      <div className="relative aspect-[16/9]">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover object-top"
          priority={isActive}
        />
      </div>
    </div>
  )
}
