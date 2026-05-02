import type { Metadata } from "next"
import Link from "next/link"

import { CTAPanel, MarketingPageFrame, PageHero, SectionHeader } from "@/components/marketing/site-ui"

export const metadata: Metadata = {
  title: "Notes9 vs Benchling",
  description:
    "How Notes9 compares to Benchling on pricing, literature-aware AI with Catalyst, and a connected workspace from papers to experiments to writing.",
}

export default function VsBenchlingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Compare"
        title={
          <>
            Notes9 vs Benchling —{" "}
            <span className="text-[var(--n9-accent)]">literature-native AI</span>, researcher-first pricing
          </>
        }
        description="Benchling is a strong ELN for regulated teams with enterprise budgets. Notes9 is built for researchers who want Catalyst AI reading their papers and experiments together — without a six-figure entry ticket."
        actions={[
          { href: "/auth/login", label: "Start free" },
          { href: "/#contact", label: "Talk to us", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="At a glance"
            title="Why teams evaluate Notes9 alongside Benchling"
            description="Fair comparison: Benchling excels at validated LIMS-style deployments. Notes9 focuses on AI-native continuity between literature, execution, and writing."
          />
          <ul className="mx-auto mt-10 max-w-3xl space-y-4 text-base leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Pricing:</strong> Benchling commonly lands in five figures per year for
              teams; Notes9 starts free so postdocs and small labs can adopt without procurement cycles.
            </li>
            <li>
              <strong className="text-foreground">Catalyst AI:</strong> Benchling&apos;s roadmap emphasizes notebook and
              registry workflows — Notes9 ships Catalyst AI grounded in your literature reviews, protocols, and drafts in
              one workspace.
            </li>
            <li>
              <strong className="text-foreground">Context:</strong> Notes9 is explicitly built around reducing tool
              switching — PubMed-class search, experiments, and writing stay linked so you stop re-explaining your
              science to every app.
            </li>
          </ul>
          <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-muted-foreground">
            Pricing on competitor products changes — validate Benchling quotes with their sales team. This page reflects
            typical researcher-reported stacks as of publication.
          </p>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Try the workflow that fits your lab first"
            description="Literature search and experiment logging are both free starting points."
            primary={{ href: "/auth/login", label: "Start free — no credit card" }}
            secondary={{ href: "/#contact", label: "See a 5-minute demo", variant: "outline" }}
          />
          <p className="mt-10 text-center text-sm text-muted-foreground">
            <Link href="/platform" className="font-medium text-[var(--n9-accent)] hover:text-[var(--n9-accent-hover)] hover:underline">
              ← Back to Product
            </Link>
          </p>
        </div>
      </section>
    </MarketingPageFrame>
  )
}
