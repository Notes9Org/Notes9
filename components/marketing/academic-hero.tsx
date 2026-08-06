"use client"

import type { CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, Play } from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"
import { HeroSearch } from "@/components/marketing/hero-search"

/** Inline helper to set the staggered reveal delay CSS var. */
const rise = (delay: number): CSSProperties => ({ ["--n9-rise-delay" as string]: `${delay}ms` } as CSSProperties)

export function AcademicHero() {
  return (
    <section className="sticky top-16 z-0 flex min-h-[calc(100vh-4rem)] min-h-[calc(100svh-4rem)] items-center overflow-x-clip overflow-y-hidden py-12 sm:py-16">
      {/* Modern aurora + depth-of-field background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="n9-dotgrid n9-mask-radial absolute inset-0 opacity-70" />
        <div className="n9-aurora absolute left-1/2 top-[-14%] h-[520px] w-[680px] -translate-x-1/2 rounded-full bg-[var(--n9-accent)]/[0.10] blur-[110px] sm:h-[680px] sm:w-[900px]" />
        <div className="n9-aurora absolute right-[-12%] top-[6%] h-[360px] w-[440px] rounded-full bg-amber-500/[0.06] blur-[100px] [animation-delay:-8s] sm:h-[460px] sm:w-[560px]" />
        <div className="n9-aurora absolute bottom-[2%] left-[-10%] h-[320px] w-[420px] rounded-full bg-[var(--n9-accent)]/[0.07] blur-[100px] [animation-delay:-15s] sm:h-[400px] sm:w-[520px]" />
        <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(58%_60%_at_50%_0%,var(--n9-accent-glow),transparent_70%)]" />
      </div>

      <div className="container relative z-10 mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6 text-center sm:space-y-8">
          <h1
            className="n9-rise mx-auto max-w-4xl font-serif text-[2.6rem] font-bold leading-[1.04] tracking-[-0.02em] text-foreground sm:text-[3.4rem] lg:text-[4.3rem] lg:leading-[1.0]"
            style={rise(80)}
          >
            AI that answers from{" "}
            <span className="n9-gradient-text n9-shimmer inline-block">your lab&rsquo;s actual work.</span>
          </h1>

          <p
            className="n9-rise mx-auto max-w-2xl text-pretty text-[1.05rem] leading-relaxed text-muted-foreground sm:text-[22px] sm:leading-relaxed"
            style={rise(180)}
          >
            <span className="font-semibold text-foreground">Stop re-explaining your project to AI.</span>{" "}
            Your papers, experiments, data and notes live in Notes9, so its AI reasons from your real
            work - and cites every claim.
          </p>

          <div className="n9-rise" style={rise(280)}>
            <HeroSearch />
          </div>

          <div
            className="n9-rise flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4"
            style={rise(380)}
          >
            <Button
              asChild
              size="lg"
              className="group h-11 w-full rounded-full bg-[var(--n9-accent)] px-6 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-[var(--n9-accent-hover)] sm:w-auto"
            >
              <Link href="/auth/sign-up">
                Start free
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="h-11 w-full rounded-full px-5 text-[15px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground sm:w-auto"
            >
              <Link href="/#contact">
                <Play className="mr-2 h-4 w-4" />
                Book a demo
              </Link>
            </Button>
            <span className="hidden text-[13px] text-muted-foreground/70 sm:inline">
              Free credits when you sign up
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
