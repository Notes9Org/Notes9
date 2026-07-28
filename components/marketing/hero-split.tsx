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
    <section className="relative isolate overflow-hidden lg:grid lg:min-h-[92svh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
      {/* ── Left: the claim and the one control ──────────────────────────── */}
      <div className="relative flex flex-col justify-center px-4 pb-14 pt-20 sm:px-8 lg:px-12 lg:py-16 xl:px-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_20%_0%,color-mix(in_oklab,var(--n9-accent)_11%,transparent),transparent_72%)]" />
          <div className="n9-grain-overlay" />
        </div>

        <div className="w-full max-w-xl">
          <p className="n9-label n9-rise" style={{ ["--n9-rise-delay" as string]: "60ms" }}>
            The connected research workspace
          </p>

          <h1 className="mt-7 font-serif tracking-[-0.035em] text-[clamp(2.5rem,4.6vw,4.25rem)] leading-[1.0]">
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
            className="n9-rise mt-6 max-w-md text-[16px] leading-[1.75] text-foreground/70"
            style={{ ["--n9-rise-delay" as string]: "360ms" }}
          >
            Every paper, protocol, result and note stays linked — so the assistant you ask
            has already read all of it, and cites what it used.
          </p>

          <div
            className="n9-rise mt-9"
            style={{ ["--n9-rise-delay" as string]: "440ms" }}
          >
            <HeroSearch />
          </div>

          <div
            className="n9-rise mt-14"
            style={{ ["--n9-rise-delay" as string]: "600ms" }}
          >
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

      {/* ── Right: what comes back ───────────────────────────────────────── */}
      <aside className="hidden p-3 lg:block">
        <ShowcasePanel />
      </aside>
    </section>
  )
}

function ShowcasePanel() {
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[28px] border border-border/50 px-10 py-12 xl:px-14">
      <PanelField />

      <div className="relative">
        <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="size-1.5 rounded-[1px] bg-[var(--n9-accent)]" />
          What comes back
        </p>
        <p className="mt-4 max-w-sm font-serif text-[22px] leading-snug tracking-tight text-foreground">
          &ldquo;Draft an ELISA protocol from what we already have.&rdquo;
        </p>
      </div>

      {/* The artefact, at full fidelity and bleeding off the right edge so it
          reads as a window into the app rather than a picture placed on a slide. */}
      <div className="relative mt-8 -mr-16 xl:-mr-10">
        <HeroCatalystPanel className="w-full" />
      </div>

      <p className="relative mt-7 max-w-sm text-[13.5px] leading-6 text-muted-foreground">
        It reads your workspace first, names every source it opened, and builds the
        protocol section by section — so you can check the work, not just the answer.
      </p>
    </div>
  )
}

/** Panel-scoped colour field, matching the sign-up screen's showcase surface. */
function PanelField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--n9-accent)_5%,var(--card))]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px)] [background-size:52px_52px]" />
      <div className="absolute -inset-[20%] opacity-90 blur-[70px] saturate-[1.12]">
        <div className="absolute inset-0 [background:radial-gradient(56%_38%_at_46%_-4%,color-mix(in_oklab,#f6e4cf_58%,transparent),transparent_72%),radial-gradient(40%_50%_at_14%_26%,color-mix(in_oklab,var(--n9-accent)_34%,transparent),transparent_68%),radial-gradient(38%_46%_at_86%_66%,color-mix(in_oklab,#7f8f74_30%,transparent),transparent_70%)]" />
      </div>
      <div className="n9-grain-overlay" />
    </div>
  )
}
