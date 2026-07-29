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
  HeroSidebarPanel,
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
  { Panel: HeroNotePanel, key: "note" },
  { Panel: HeroProtocolPanel, key: "protocol" },
  { Panel: HeroChartPanel, key: "data" },
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
          declares its position in the cycle. Every panel stays aria-hidden:
          this is decoration, and the answer it illustrates is written out in
          the heading beside it. */}
      <div
        aria-hidden
        className="n9-hero-cast pointer-events-auto absolute left-[49%] top-1/2 hidden h-[40rem] w-[54rem] -translate-y-1/2 isolate xl:block"
      >
        <div className="pointer-events-none absolute left-[17rem] top-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--n9-accent)]/[0.13] blur-3xl" />

        {/* The workspace: sidebar and answer as one window, tilted a couple of
            degrees so it reads as an object lying on the page rather than a
            screenshot pasted onto it. The sidebar earns its place by showing
            the full span of what Notes9 holds, and by naming the project and
            experiment the answer beside it is reasoning over. */}
        {/* Square to the reader and leaning back into the page rather than
            turned to either side: no in-plane rotation, a small backward lean
            and a push into depth, so the cards in front of it have somewhere
            to sit. drop-shadow rather than box-shadow because the sidebar and
            the answer are separate boxes, and only a filter casts one shadow
            for the pair instead of a seam down the middle. */}
        <div className="absolute left-0 top-1/2 z-0 flex h-[35rem] w-[37rem] items-stretch drop-shadow-[0_60px_90px_rgba(44,36,24,0.28)] [transform:translateY(-50%)_perspective(2600px)_translateZ(-70px)_rotateX(2.5deg)] [transform-origin:50%_50%]">
          <HeroSidebarPanel className="w-[12.5rem] shrink-0 rounded-r-none border-r-0" />
          <HeroGroundedAnswerPanel className="min-w-0 flex-1 rounded-l-none bg-card" />
        </div>

        {/* The records it cites, circulating across the answer's bottom-right
            corner. The overlap is deliberately small: enough that the cards
            read as lying on the workspace rather than parked beside it, not
            enough to cut into the answer, which stays readable end to end. */}
        <div className="n9-deck absolute bottom-[3rem] left-[34.5rem] z-20 hidden h-[20rem] w-[18rem] min-[1440px]:block">
          {DECK.map(({ Panel, key }, i) => (
            <div
              key={key}
              className="n9-deck-card"
              style={{ "--n9-deck-i": i } as CSSProperties}
            >
              <div className="n9-deck-orbit">
                <Panel className="n9-deck-face pointer-events-auto h-full w-full bg-card backdrop-blur-none shadow-[0_34px_80px_-34px_rgba(44,36,24,0.55)]" />
              </div>
            </div>
          ))}
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
            Every paper, protocol, result and note stays linked, so the assistant you ask
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
