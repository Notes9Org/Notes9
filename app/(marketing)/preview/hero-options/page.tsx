import type { Metadata } from "next"
import {
  HeroOptionA,
  HeroOptionB,
  HeroOptionC,
} from "@/components/marketing/hero-options"

export const metadata: Metadata = {
  title: "Hero options — Notes9",
  description: "Three hero directions side by side, for comparison.",
  robots: { index: false, follow: false },
}

const OPTIONS = [
  {
    key: "A",
    name: "One large app window",
    note: "Say it plainly, then show the whole product at size on a slight tilt. The register Linear, Framer and Vercel use — conventional, but conventional because nothing competes with the app itself.",
    Component: HeroOptionA,
  },
  {
    key: "B",
    name: "Real UI fragments, connected",
    note: "Actual crops of the running product — a rendered protocol document, the Plotly standard curve, a real paper card, Catalyst's tool calls — orbiting the headline with the links drawn between them.",
    Component: HeroOptionB,
  },
  {
    key: "C",
    name: "Question → answer",
    note: "Shows the job rather than the software. A real question, and the answer assembling beside it with citation chips naming the records it came from. The only option that reads without knowing what an ELN is.",
    Component: HeroOptionC,
  },
]

/**
 * Scratch route for comparing hero directions.
 *
 * Not linked from anywhere and marked noindex — this exists so a decision can be
 * made by looking rather than by describing. Once one wins, it moves into
 * app/(marketing)/preview/page.tsx and this route and its component can go.
 */
export default function HeroOptionsPage() {
  return (
    <div className="pb-24">
      {OPTIONS.map(({ key, name, note, Component }) => (
        <section key={key} className="border-b border-border/60">
          <div className="container mx-auto px-4 pt-10 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--n9-accent)]">
                Option {key}
              </span>
              <h2 className="font-serif text-[22px] tracking-tight text-foreground">{name}</h2>
            </div>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted-foreground">{note}</p>
          </div>
          <Component />
        </section>
      ))}
    </div>
  )
}
