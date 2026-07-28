"use client"

import { motion, useReducedMotion } from "framer-motion"
import { HeroAppFrame } from "@/components/marketing/hero-app-frame"
import { HeroSearch } from "@/components/marketing/hero-search"

/**
 * Literature-search hero.
 *
 * The product is not shown *beside* the pitch here — it is the surface the
 * pitch sits on. The literature page fills the section, sidebar and all, so the
 * visitor is looking at Notes9 before they have read a word. The only live
 * control is our own search bar, floating above it.
 *
 * The backdrop is real markup rather than an image (HeroAppFrame): sharp at any
 * viewport, theme-aware without needing a second capture, and free to download.
 *
 * Two deliberate constraints make that work:
 *
 *  1. The UI is pushed back with a graded wash so it reads as context rather
 *     than as an interface competing for clicks, and its own search field is
 *     rendered flat. Without that the visitor tries to type into the wrong box.
 *  2. There are no other calls to action. The buttons that used to sit under
 *     the search bar were splitting attention three ways; here the single
 *     working control is the one the whole section is about. Sign-up is still a
 *     click away in the header, and running a search routes into it anyway.
 */
export function HeroLiterature() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="relative isolate flex min-h-[86svh] items-center overflow-hidden">
      {/* ── The product, as backdrop ─────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Rendered, not screenshotted — see HeroAppFrame for why. */}
        <HeroAppFrame className="absolute inset-0 hidden h-full w-full sm:block" />

        {/* Legibility is handled locally rather than globally. A light overall
            veil keeps the capture from competing outright, and a much stronger
            radial sits only behind the type. Washing the whole image instead —
            the first version did — buys the same contrast at the cost of every
            detail in the product, which defeats the point of showing it. */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--background)_18%,transparent)_0%,color-mix(in_oklab,var(--background)_34%,transparent)_30%,color-mix(in_oklab,var(--background)_40%,transparent)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_52%_at_52%_46%,color-mix(in_oklab,var(--background)_46%,transparent)_0%,transparent_72%)]" />

        {/* Same warmth and texture the rest of the page uses, so this section
            still belongs to the site rather than to the app. */}
        <div className="n9-organic n9-organic-mask opacity-35" />
        <div className="n9-grain-overlay" />
        <div className="n9-vignette" />
      </div>

      {/* ── The one live control ─────────────────────────────────────────── */}
      <div className="container relative mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {/* Frosted panel. Gaussian-blurring what is behind the type carries the
            legibility locally, so the app can stay sharp everywhere else — and
            it reads as a deliberate surface rather than as a washed-out patch. */}
        <div className="n9-grain mx-auto flex max-w-3xl flex-col items-center rounded-[32px] border border-[color:var(--glass-border)] bg-background/70 px-6 py-12 text-center shadow-[0_40px_120px_-45px_rgba(44,36,24,0.45)] backdrop-blur-2xl sm:px-14 sm:py-14">
          <p className="n9-label n9-rise" style={{ ["--n9-rise-delay" as string]: "60ms" }}>
            The connected research workspace
          </p>

          <h1 className="mt-7 font-serif tracking-[-0.03em] text-[clamp(2.4rem,6vw,4.8rem)] leading-[1.0]">
            <span
              className="n9-rise block text-foreground"
              style={{ ["--n9-rise-delay" as string]: "140ms" }}
            >
              AI that answers from
            </span>
            <span
              className="n9-rise block text-muted-foreground"
              style={{ ["--n9-rise-delay" as string]: "240ms" }}
            >
              your lab&apos;s actual work.
            </span>
          </h1>

          <p
            className="n9-rise mt-6 max-w-xl text-[17px] leading-7 text-foreground/80"
            style={{ ["--n9-rise-delay" as string]: "320ms" }}
          >
            Every paper, protocol, result and note stays linked — so the AI you ask has
            already read all of it.
          </p>

          <div
            className="n9-rise mt-9 w-full max-w-2xl"
            style={{ ["--n9-rise-delay" as string]: "400ms" }}
          >
            <p className="mb-3 flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--n9-accent)]">
              <span className="h-px w-6 bg-[var(--n9-accent)]/40" />
              Try it right now — no account needed
              <span className="h-px w-6 bg-[var(--n9-accent)]/40" />
            </p>

            {/* Breathing accent halo. The search was previously just one more
                control in a stack; this makes it the obvious next move without
                resorting to a flashing border. */}
            <div className="relative">
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -inset-3 -z-10 rounded-full bg-[var(--n9-accent)]/25 blur-2xl"
                animate={reduceMotion ? undefined : { opacity: [0.45, 0.9, 0.45], scale: [1, 1.035, 1] }}
                transition={{ duration: 3.6, ease: "easeInOut", repeat: Infinity }}
              />
              <HeroSearch />
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
