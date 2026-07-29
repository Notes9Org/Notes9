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
          object lying across the section, pushed well past the right edge so
          only its left portion is in frame — a window, not a slide. Nothing
          frames it, so there is no second surface for the eye to read as "the
          other half". */}
      {/* A collage of the surfaces one answer touches. Each is tilted on its
          own axis and carries its own shadow, so they read as separate sheets
          laid over each other rather than one flat composite. The answer sits
          in front at full strength; the four it draws on sit behind it, each
          turned far enough back to show only the part a researcher would
          recognise — the fitted curve, the cited papers, the versioned SOP
          list, the document page. Pulled left and scaled down from the earlier
          single panel so the whole stack sits inside the frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-4%] top-1/2 hidden h-[44rem] w-[40rem] -translate-y-1/2 [perspective:2600px] lg:block xl:right-[-1%] xl:w-[44rem]"
      >
        <div className="absolute -inset-10 -z-10 rounded-[56px] bg-[var(--n9-accent)]/[0.08] blur-3xl" />

        <HeroReferencesPanel className="absolute left-0 top-[1%] w-[17rem] origin-center [transform:rotateY(-16deg)_rotateX(5deg)_rotate(-3deg)_scale(0.86)] opacity-65 shadow-[0_26px_60px_-34px_rgba(44,36,24,0.45)]" />
        <HeroChartPanel className="absolute right-0 top-[4%] w-[18rem] origin-center [transform:rotateY(-13deg)_rotateX(4deg)_rotate(2deg)_scale(0.86)] opacity-70 shadow-[0_26px_60px_-34px_rgba(44,36,24,0.45)]" />
        <HeroProtocolPanel className="absolute bottom-[3%] left-0 w-[17rem] origin-center [transform:rotateY(-15deg)_rotateX(4deg)_rotate(2deg)_scale(0.86)] opacity-65 shadow-[0_26px_60px_-34px_rgba(44,36,24,0.45)]" />
        <HeroNotePanel className="absolute bottom-[1%] right-0 w-[17rem] origin-center [transform:rotateY(-12deg)_rotateX(5deg)_rotate(-2deg)_scale(0.86)] opacity-65 shadow-[0_26px_60px_-34px_rgba(44,36,24,0.45)]" />

        <HeroGroundedAnswerPanel className="absolute left-1/2 top-1/2 z-10 w-[21rem] origin-center [transform:translate(-50%,-50%)_rotateY(-14deg)_rotateX(3deg)_rotate(-1deg)_scale(0.97)] shadow-[0_60px_120px_-40px_rgba(44,36,24,0.55)]" />
      </div>

      <div className="container relative mx-auto flex min-h-[92svh] items-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl">
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
