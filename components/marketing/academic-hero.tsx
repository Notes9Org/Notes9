"use client"

import { useRef } from "react"
import Link from "next/link"
import { motion, useScroll, useTransform } from "framer-motion"
import { ArrowRight, Play, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConnectedResearchSystemDiagram } from "@/components/marketing/connected-research-system-diagram"
import { HeroMolecules } from "@/components/marketing/hero-molecules"
import { PretextReveal } from "@/components/ui/fluid-text"

export function AcademicHero() {
  const sectionRef = useRef<HTMLElement>(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 40])

  return (
    <section ref={sectionRef} className="relative overflow-x-clip overflow-y-hidden pb-8 sm:pb-0">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[540px] -translate-x-1/2 rounded-full bg-[var(--n9-accent)]/[0.07] blur-[90px] sm:h-[600px] sm:w-[800px] sm:blur-[120px] animate-[drift_20s_ease-in-out_infinite]" />
        <div className="absolute right-[-18%] top-[20%] h-[260px] w-[320px] rounded-full bg-amber-600/[0.04] blur-[72px] sm:right-[-10%] sm:h-[400px] sm:w-[500px] sm:blur-[100px] animate-[drift_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute left-[-12%] bottom-[10%] h-[220px] w-[280px] rounded-full bg-[var(--n9-accent)]/[0.05] blur-[72px] sm:left-[-5%] sm:h-[350px] sm:w-[450px] sm:blur-[100px] animate-[drift_22s_ease-in-out_infinite_2s]" />
      </div>
      <HeroMolecules />

      <div className="container relative z-10 mx-auto px-4 pt-6 sm:px-6 sm:pt-14 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.15, ease: "easeOut" }}
          style={{ y: heroY }}
          className="mt-2 grid w-full min-w-0 items-start gap-6 sm:mt-4 sm:gap-8 lg:mt-10 lg:grid-cols-2 lg:gap-10 xl:grid-cols-[5fr_7fr] xl:gap-12"
        >
          <div className="relative order-2 min-w-0 lg:order-1 lg:pt-2 xl:pt-4">
            {/* Frosted scrim: blurs the sticky-note backdrop behind the hero copy
                for readability while keeping it faintly visible. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-4 -inset-y-6 bg-background/45 backdrop-blur-[7px] dark:bg-background/35 [mask-image:radial-gradient(120%_115%_at_42%_50%,#000_50%,transparent_100%)]"
            />
            <div className="relative z-10 space-y-5 sm:space-y-7">
            <div className="max-w-3xl text-left font-serif text-[2.35rem] font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.45rem] lg:leading-[1.14] leading-[1.12]">
              <PretextReveal text="The research workspace" />
              <motion.span
                className="n9-gradient-text inline-block"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                that remembers why.
              </motion.span>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="max-w-2xl text-left text-[1.05rem] leading-relaxed text-muted-foreground sm:text-[22px] sm:leading-relaxed"
            >
              <p className="text-pretty">
                Notes9 connects your{" "}
                <span className="font-medium text-foreground">papers, protocols, experiments, notes, and reports</span>{" "}
                into one traceable project memory — so the reasoning behind every result is never lost
                across PDFs, spreadsheets, ELNs, and scattered AI chats.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:gap-4"
            >
              <Button
                asChild
                size="lg"
                className="group h-12 w-full rounded-full bg-[linear-gradient(115deg,var(--n9-accent),color-mix(in_oklab,var(--n9-accent)_58%,#d9a24a))] px-8 text-white shadow-[0_14px_44px_-12px_var(--n9-accent-glow)] transition-all duration-300 hover:opacity-95 hover:shadow-[0_22px_56px_-12px_var(--n9-accent-glow)] sm:w-auto"
              >
                <Link href="/auth/sign-up">
                  Start free
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 w-full rounded-full border-border/60 px-8 transition-colors duration-200 hover:border-[var(--n9-accent)]/40 sm:w-auto"
              >
                <Link href="/#contact">
                  <Play className="mr-2 h-4 w-4" />
                  Book a demo
                </Link>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="flex justify-start pt-1"
            >
              <Link
                href="/#catalyst"
                className="group inline-flex items-center gap-2.5 rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)]/70 px-3.5 py-1.5 text-[16px] text-muted-foreground transition-colors hover:border-[var(--n9-accent)]/40"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--n9-accent)] text-white">
                  <Sparkles className="h-3 w-3" />
                </span>
                Powered by{" "}
                <span className="font-semibold text-[var(--n9-accent)]">Catalyst</span>
                <span className="hidden sm:inline">— biology-first AI</span>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--n9-accent)]/60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
            </div>
          </div>

          <div className="order-1 min-w-0 lg:order-2">
            <div className="relative mx-auto w-full max-w-[92vw] sm:max-w-none">
              {/* Opaque card backing so the illustration reads clearly over the
                  sticky-note backdrop. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-1 inset-y-3 rounded-[2rem] border border-border/60 bg-card shadow-[0_30px_90px_-44px_rgba(44,36,24,0.4)] dark:shadow-[0_30px_90px_-44px_rgba(0,0,0,0.65)]"
              />
              <div className="relative z-10">
                <ConnectedResearchSystemDiagram className="w-full min-w-0" />
              </div>
            </div>
          </div>
        </motion.div>

      </div>

      <div className="h-auto min-h-16 py-4 sm:h-20 sm:min-h-0 sm:py-0">
        <div className="container mx-auto flex h-full items-center px-4 sm:px-6 lg:px-8">
          <p className="max-w-4xl text-[16px] text-muted-foreground/95 sm:text-[18px]">
            For researchers tired of scattered papers, notes, protocols, spreadsheets, and disconnected AI tools.
          </p>
        </div>
      </div>
    </section>
  )
}
