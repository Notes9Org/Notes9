"use client"

import {
  Books,
  ClipboardText,
  Flask as FlaskConical,
  ChartLine,
  PencilSimpleLine,
} from "@phosphor-icons/react/ssr"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { HeroSearch } from "@/components/marketing/hero-search"
import { HeroCatalystPanel } from "@/components/marketing/hero-app-frame"

/**
 * Split hero: the argument on the left, the answer on the right.
 *
 * Structure borrowed from the sign-up screen, which already solves this problem
 * — a left column you act in, and a right column that is its own contained
 * surface showing what happens next. Giving that half a real surface is what
 * stops it reading as decoration; the earlier attempt at floating panels over
 * the whole section failed precisely because nothing contained them.
 *
 * The pairing is deliberate rather than ornamental. The left column ends in a
 * question box; the right column shows what comes back from asking — Catalyst
 * reasoning, naming the records it opened, and building the answer section by
 * section. Question on one side, answer on the other.
 *
 * One artefact, at full fidelity. Four half-transparent panels read as a page
 * still loading; one crisp panel reads as the product.
 */

const SCOPE: { label: string; icon: PhosphorIcon }[] = [
  { label: "Literature", icon: Books },
  { label: "Protocols", icon: ClipboardText },
  { label: "Experiments", icon: FlaskConical },
  { label: "Data", icon: ChartLine },
  { label: "Writing", icon: PencilSimpleLine },
]

export function HeroSplit() {
  return (
    <section className="relative isolate min-h-[92svh] overflow-hidden">
      {/* One continuous field across the whole section. The sign-up screen is
          two surfaces meeting down the middle; this is a single plane with
          something sitting on it — which is the structural difference, not a
          styling one. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(58%_54%_at_16%_4%,color-mix(in_oklab,var(--n9-accent)_12%,transparent),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(46%_60%_at_86%_58%,color-mix(in_oklab,#7f8f74_16%,transparent),transparent_72%)]" />
        <div className="n9-grain-overlay" />
      </div>

      {/* The artefact is not in a panel and not in a column. It is a single
          object lying across the section — oversized, overlapping the copy's
          measure, and cropped by the right edge. Nothing frames it, so there is
          no second surface for the eye to read as "the other half". */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-1/2 hidden w-[54rem] -translate-y-1/2 lg:block xl:right-[-6%] xl:w-[60rem]"
      >
        <div className="absolute -inset-10 -z-10 rounded-[48px] bg-[var(--n9-accent)]/[0.07] blur-3xl" />
        <HeroCatalystPanel className="w-full" />
      </div>

      <div className="container relative mx-auto flex min-h-[92svh] items-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="w-full max-w-lg">
          <p className="n9-label n9-rise" style={{ ["--n9-rise-delay" as string]: "60ms" }}>
            The connected research workspace
          </p>

          <h1 className="mt-7 font-serif tracking-[-0.035em] text-[clamp(2.5rem,4.4vw,4rem)] leading-[1.0]">
            <span
              className="n9-rise block text-foreground"
              style={{ ["--n9-rise-delay" as string]: "150ms" }}
            >
              AI that answers from
            </span>
            <span
              className="n9-rise block text-muted-foreground"
              style={{ ["--n9-rise-delay" as string]: "260ms" }}
            >
              your lab&apos;s actual work.
            </span>
          </h1>

          <p
            className="n9-rise mt-6 max-w-sm text-[16px] leading-[1.75] text-foreground/70"
            style={{ ["--n9-rise-delay" as string]: "360ms" }}
          >
            Every paper, protocol, result and note stays linked — so the assistant you ask
            has already read all of it, and cites what it used.
          </p>

          <div className="n9-rise mt-9" style={{ ["--n9-rise-delay" as string]: "440ms" }}>
            <HeroSearch />
          </div>

          <div className="n9-rise mt-12" style={{ ["--n9-rise-delay" as string]: "600ms" }}>
            <hr className="n9-hairline" />
            <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              {SCOPE.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  <Icon className="size-3.5 text-[var(--n9-accent)]/70" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
