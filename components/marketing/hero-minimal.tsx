"use client"

import { HeroSearch } from "@/components/marketing/hero-search"

/**
 * Minimal hero.
 *
 * A deliberate reversal. Earlier passes answered "this doesn't feel modern" by
 * adding — a product backdrop, then floating panels, then more panels, then
 * depth grading across them. That was the wrong instinct twice over.
 *
 * First, adding is the opposite of what minimal means. Second, and more
 * concretely: UI replicas rendered at partial opacity read as *unfinished*
 * rather than as distant. A half-transparent interface looks like an image that
 * failed to load or a screen still rendering — the eye interprets low-fidelity
 * UI as broken, not as far away. Depth of field works on photographs because
 * blur is a physical cue; on flat interface chrome it just reads as a fault.
 *
 * So the product is not in this section at all. What is left is the argument,
 * the one control that acts on it, and room to breathe. Everything here earns
 * its place:
 *
 *   · a mono index label, for structure
 *   · the claim, at display size
 *   · one sentence of support
 *   · the search — the only interactive element on the screen
 *   · a hairline and the product's scope, anchoring the base
 *
 * That last row matters more than it looks. A hero with nothing below the fold
 * of its own content feels truncated; a quiet closing rule gives the section a
 * bottom edge, which is the difference between "spare" and "unfinished".
 */

const SCOPE = ["Literature", "Protocols", "Experiments", "Data", "Writing"]

export function HeroMinimal() {
  return (
    <section className="relative isolate flex min-h-[92svh] flex-col overflow-hidden">
      {/* One soft light source and a little grain. No drifting field, no grid,
          no vignette — each of those was another thing competing for attention
          in a section whose whole point is that almost nothing does. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(64%_100%_at_50%_0%,color-mix(in_oklab,var(--n9-accent)_13%,transparent),transparent_70%)]" />
        <div className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(38%_70%_at_78%_6%,color-mix(in_oklab,#c9a227_10%,transparent),transparent_72%)]" />
        <div className="n9-grain-overlay" />
      </div>

      {/* Content sits optically high rather than dead-centre — a headline
          centred in the full viewport height always reads as sinking. */}
      <div className="container mx-auto flex flex-1 items-center px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
        <div className="w-full max-w-4xl">
          <p className="n9-label n9-rise" style={{ ["--n9-rise-delay" as string]: "60ms" }}>
            The connected research workspace
          </p>

          <h1 className="mt-8 font-serif tracking-[-0.035em] text-[clamp(2.75rem,6.8vw,5.75rem)] leading-[0.98]">
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
            className="n9-rise mt-8 max-w-xl text-[17px] leading-[1.75] text-foreground/70 sm:text-[18px]"
            style={{ ["--n9-rise-delay" as string]: "360ms" }}
          >
            Every paper, protocol, result and note stays linked — so the assistant you ask
            has already read all of it, and cites what it used.
          </p>

          <div
            className="n9-rise mt-12 max-w-2xl"
            style={{ ["--n9-rise-delay" as string]: "440ms" }}
          >
            <HeroSearch />
          </div>
        </div>
      </div>

      {/* Closing rule. Gives the section a bottom edge and states the product's
          scope without a feature list. */}
      <div
        className="n9-rise container mx-auto px-4 pb-10 sm:px-6 lg:px-8"
        style={{ ["--n9-rise-delay" as string]: "620ms" }}
      >
        <hr className="n9-hairline" />
        <ul className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-2">
          {SCOPE.map((s) => (
            <li
              key={s}
              className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
