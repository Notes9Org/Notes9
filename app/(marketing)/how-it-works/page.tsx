import type { Metadata } from "next"
import { BrowserFrame } from "@/components/marketing/browser-frame"
import { WorkflowWalkthrough } from "@/components/marketing/workflow-walkthrough"
import {
  CTAPanel,
  MarketingPageFrame,
  PageHero,
  SectionHeader,
} from "@/components/marketing/site-ui"

export const metadata: Metadata = {
  title: "How Notes9 works | From question to published paper",
  description:
    "Walk through a full research cycle in Notes9: literature search, protocol, experiment, analysis and manuscript, and see how each step stays connected to the last.",
}

/**
 * The workflow walkthrough page.
 *
 * `/platform` sells the surface area (here are the modules); this page sells the
 * throughline (here is one piece of work moving through them). That distinction
 * is the product's actual argument — an ELN records what happened, Notes9 keeps
 * the chain between steps intact — and nothing on the site made it concretely
 * before this page.
 *
 * NB: this route must also be listed in `publicRoutes` in
 * lib/supabase/middleware.ts, which matches exact pathnames — otherwise a
 * logged-out visitor is redirected to /auth/login.
 */
export default function HowItWorksPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="How it works"
        title={
          <>
            From a question to a{" "}
            <span className="text-[var(--n9-accent)]">published paper</span>, without losing the
            thread.
          </>
        }
        description="Five steps, one continuous record. Every protocol keeps its literature, every result keeps its protocol, and every claim in your manuscript can be traced back to the day you ran it."
        actions={[
          { href: "/auth/sign-up", label: "Start free" },
          { href: "/platform", label: "See the platform", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="The research cycle"
            title="One project, start to finish"
            description="Pick a step to see the screen you'd actually be looking at."
          />
          <div className="mt-12">
            <WorkflowWalkthrough />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Why it compounds"
            title="The connections are the product"
            description="Each step above writes a link, not just a record. After a few months those links are a map of how your lab actually reached its conclusions, and it is what Catalyst reads when you ask it a question."
            align="center"
          />

          <div className="mx-auto mt-12 max-w-5xl">
            <BrowserFrame
              src="research-map"
              alt="The Notes9 research map showing projects, experiments, notes, papers and literature connected as a graph"
            />
          </div>

          <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
            <ConnectionPoint
              title="Answers you can check"
              body="Catalyst cites the note, paper or experiment behind every claim, so you can open the source instead of trusting the summary."
            />
            <ConnectionPoint
              title="Decisions that survive turnover"
              body="The reasoning behind a switched construct or a rejected condition stays attached to the work, not in someone's departed memory."
            />
            <ConnectionPoint
              title="Write-ups that assemble themselves"
              body="By the time you draft, the methods, figures and references are already linked to the experiments they came from."
            />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Set it up around your own research"
            description="Answer three questions and Notes9 sets up a workspace matched to your field, with a sample project you can pull apart to see how it fits together."
            primary={{ href: "/auth/sign-up", label: "Start free" }}
            secondary={{ href: "/pricing", label: "See pricing" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

function ConnectionPoint({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-border/60 pt-5">
      <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}
