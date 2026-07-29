"use client"

import {
  Books,
  ClipboardText,
  Flask as FlaskConical,
  ChartLine,
  PencilSimpleLine,
} from "@phosphor-icons/react/ssr"
import type { CSSProperties } from "react"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { HeroSearch } from "@/components/marketing/hero-search"
import {
  HeroChartPanel,
  HeroGroundedAnswerPanel,
  HeroNotePanel,
  HeroProtocolPanel,
  HeroReferencesPanel,
} from "@/components/marketing/hero-app-frame"

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

/**
 * The deck, front to back. Order is the order of the answer's own citations,
 * so the screen in front when the page loads is the one the first citation
 * points at. Each card is cropped by its slot, which reads as a screen
 * continuing past the edge of the card rather than a panel that ran short.
 *
 * backdrop-blur is dropped on all of them: the deck sits on a flat gradient so
 * it buys nothing, and four blurred surfaces animating at once is the
 * difference between a smooth carousel and a stuttering one.
 */
const DECK = [
  { Panel: HeroChartPanel, key: "data" },
  { Panel: HeroNotePanel, key: "note" },
  { Panel: HeroProtocolPanel, key: "protocol" },
  { Panel: HeroReferencesPanel, key: "literature" },
]

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

      {/* One claim, made twice.

          On the right, the answer — held still and fully legible, because the
          whole argument of the page is that it cites real work. On the left,
          the records it cites, circulating so each takes its turn in front. No
          hover is needed for the point to land; hovering only pauses the
          carousel and brings the card under the cursor forward to be read.

          The pairing is what carries the meaning: the titles in the deck are
          the titles in the answer's source list, so the two halves are visibly
          the same four records seen twice — once as a citation, once as the
          screen it lives on.

          Motion lives in styles/marketing.css (.n9-deck); each card only
          declares its position in the cycle. Every panel stays aria-hidden —
          this is decoration, and the answer it illustrates is written out in
          the heading beside it. */}
      <div
        aria-hidden
        className="pointer-events-auto absolute right-[1%] top-1/2 hidden h-[34rem] w-[47rem] origin-right -translate-y-1/2 scale-[0.78] isolate lg:block xl:scale-[0.88] 2xl:right-[6%] 2xl:scale-100"
      >
        <div className="pointer-events-none absolute left-[38%] top-1/2 -z-10 h-[27rem] w-[27rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--n9-accent)]/[0.13] blur-3xl" />

        {/* The records, cycling. */}
        <div className="n9-deck absolute left-0 top-1/2 hidden h-[21.5rem] w-[19rem] -translate-y-1/2 xl:block">
          {DECK.map(({ Panel, key }, i) => (
            <div
              key={key}
              className="n9-deck-card"
              style={{ "--n9-deck-i": i } as CSSProperties}
            >
              <div className="n9-deck-orbit">
                <Panel className="n9-deck-face pointer-events-auto max-h-full w-full bg-card backdrop-blur-none shadow-[0_30px_70px_-36px_rgba(44,36,24,0.5)]" />
              </div>
            </div>
          ))}
        </div>

        {/* The answer. Square, opaque, unmoving — the one thing on this side of
            the hero that is meant to be read rather than recognised. */}
        <div className="absolute right-0 top-1/2 z-40 w-[21rem] -translate-y-1/2">
          <HeroGroundedAnswerPanel className="w-full bg-card shadow-[0_70px_140px_-40px_rgba(44,36,24,0.55)]" />
        </div>
      </div>

      {/* The content layer paints above the deck, so it would otherwise swallow
          every hover meant for the cards — an empty column still hit-tests.
          Making the wrapper transparent to the pointer and restoring it on the
          text column itself is what lets the deck be hovered at all. */}
      <div className="container pointer-events-none relative mx-auto flex min-h-[92svh] items-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="pointer-events-auto w-full max-w-2xl">
          <p className="n9-label n9-rise" style={{ ["--n9-rise-delay" as string]: "60ms" }}>
            The connected research workspace
          </p>

          <h1 className="mt-7 font-serif tracking-[-0.035em] text-[clamp(2.6rem,4.8vw,4.4rem)] leading-[1.0]">
            <span
              className="n9-rise block text-foreground"
              style={{ ["--n9-rise-delay" as string]: "150ms" }}
            >
              AI that answers from
            </span>
            <span
              className="n9-rise block text-[var(--n9-accent)]"
              style={{ ["--n9-rise-delay" as string]: "260ms" }}
            >
              your lab&apos;s actual work.
            </span>
          </h1>

          <p
            className="n9-rise mt-6 max-w-lg text-[17px] leading-[1.75] text-foreground/70 sm:text-[18px]"
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
