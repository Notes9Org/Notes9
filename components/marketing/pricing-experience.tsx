import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRight } from "lucide-react"

import { PricingGetInTouchForm } from "@/components/marketing/pricing-get-in-touch-form"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FREE_CHIPS = [
  "Literature search",
  "Electronic lab notebook",
  "Protocol drafting",
  "Sample & inventory management",
  "Data & analysis",
  "Reports & writing",
  "Catalyst AI lab assistant",
  "Research Map",
]

const contactHref = "/#contact"
const mailtoAdmin = "mailto:admin@notes9.com"

export function PricingExperienceLead() {
  return (
    <>

      <section className="border-b border-border/40 marketing-section-alt pt-16">
        <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
          <div
            className={cn(
              "mx-auto max-w-[900px] rounded-[20px] border-2 border-[var(--n9-accent)]/45 bg-gradient-to-br from-[var(--n9-accent-light)] to-emerald-50/90 px-7 py-9 text-center shadow-sm",
              "dark:from-emerald-950/35 dark:to-background/50 dark:border-[var(--n9-accent)]/35",
            )}
          >
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--n9-accent)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-foreground">
              <span aria-hidden className="text-[10px]">
                ✦
              </span>{" "}
              Free to use
            </div>
            <h2 className="mx-auto max-w-lg font-serif text-[1.65rem] font-medium leading-snug tracking-tight text-foreground sm:text-[1.75rem]">
              Get the full Notes9 experience at no cost.
            </h2>
            <p className="mx-auto mt-3 max-w-[500px] text-sm leading-[1.7] text-foreground/80 dark:text-muted-foreground">
              No pricing tiers to navigate. No feature limits to bump into. Notes9 is free while we work with early
              research teams to build the product around real workflows.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {FREE_CHIPS.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[var(--n9-accent)]/35 bg-background/85 px-3.5 py-1.5 text-xs font-medium text-[var(--n9-accent)] shadow-sm backdrop-blur-sm dark:bg-background/60"
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-7">
              <Button
                asChild
                size="lg"
                className="h-11 rounded-full bg-[var(--n9-accent)] px-7 text-sm font-medium text-primary-foreground shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
              >
                <Link href="/auth/login">
                  Try for free
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">No credit card required.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-border/40">
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div
            className={cn(
              "overflow-hidden rounded-[20px] border px-6 py-9 sm:px-8",
              // Light: cream / paper marketing shell (matches marketing-theme)
              "border-[var(--n9-accent)]/25 bg-gradient-to-br from-background via-[var(--n9-accent-light)] to-muted/80 shadow-[0_24px_70px_-44px_var(--n9-accent-glow)] ring-1 ring-inset ring-[var(--n9-accent)]/15",
              // Dark: high-contrast demo panel
              "dark:border-[var(--n9-accent)]/30 dark:bg-gradient-to-br dark:from-zinc-950 dark:via-zinc-950 dark:to-emerald-950/50 dark:shadow-[0_28px_90px_-48px_var(--n9-accent-glow)] dark:ring-white/5",
            )}
          >
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-12 lg:items-start">
              <div className="text-foreground dark:text-zinc-100">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--n9-accent)]">
                  Book a demo
                </p>
                <h2 className="font-serif text-[1.35rem] font-medium leading-snug text-foreground dark:text-zinc-50 sm:text-[1.4rem]">
                  Not a generic product walkthrough.
                </h2>
                <ul className="mt-5 flex flex-col gap-3">
                  {[
                    <>
                      <strong className="font-semibold text-foreground dark:text-zinc-50">30 minutes.</strong>{" "}
                      <span className="text-muted-foreground dark:text-zinc-300">
                        We understand your workflow and show exactly where Notes9 fits.
                      </span>
                    </>,
                    <>
                      <strong className="font-semibold text-foreground dark:text-zinc-50">No sales script.</strong>{" "}
                      <span className="text-muted-foreground dark:text-zinc-300">
                        Just a conversation about your research and where the friction is.
                      </span>
                    </>,
                  ].map((text, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--n9-accent)] shadow-[0_0_10px_var(--n9-accent-glow)]"
                        aria-hidden
                      />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Button
                    asChild
                    size="sm"
                    className="h-9 rounded-full bg-[var(--n9-accent)] px-5 text-[13px] font-medium text-primary-foreground shadow-[0_10px_28px_-10px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
                  >
                    <Link href={contactHref}>Book a 30-min demo</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 rounded-full px-5 text-[13px] font-normal",
                      "border-border bg-card/80 text-foreground hover:bg-muted",
                      "dark:border-zinc-500/80 dark:bg-white/5 dark:text-zinc-200 dark:backdrop-blur-sm dark:hover:border-[var(--n9-accent)]/45 dark:hover:bg-[var(--n9-accent)]/10 dark:hover:text-white",
                    )}
                  >
                    <Link href={mailtoAdmin}>Email us instead</Link>
                  </Button>
                </div>
              </div>

              <PricingGetInTouchForm />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export const pricingStoryFaqs: { question: string; answer: ReactNode }[] = [
  {
    question: "Is Notes9 really free? What is the catch?",
    answer: (
      <p>
        No catch. Notes9 is free during our early access phase while we work closely with research teams to build the
        product around real workflows. You get the full connected workspace — literature, experiments, lab notes, data,
        writing, and Catalyst AI — at no cost. When we introduce paid plans, early users will get preferential pricing and
        we will give you plenty of notice before anything changes.
      </p>
    ),
  },
  {
    question: "What does a demo call actually involve?",
    answer: (
      <p>
        A 30-minute conversation — no slides, no sales deck. We start by understanding your current workflow: what you
        are working on, which tools you use, and where the friction is. Then we show you the parts of Notes9 most relevant
        to your work. If it is a fit, we get you set up the same day. If your lab needs a custom plan, we send a tailored
        proposal within 48 hours.
      </p>
    ),
  },
  {
    question: "How long does it take to get started?",
    answer: (
      <p>
        Two minutes to create an account. Most researchers are running an active workflow — with at least one project,
        some saved papers, and their first AI interaction — within the first session. If you book a demo, we will walk
        you through setup live and make sure your first project is connected before the call ends.
      </p>
    ),
  },
  {
    question: "Can I bring my existing notes, papers, and protocols into Notes9?",
    answer: (
      <p>
        Yes. You can upload PDFs, Word docs, Excel files, images, and most common formats directly into Notes9. For
        teams migrating from another ELN or a large paper archive, we will help you set up the import during onboarding.
        The goal is to have your existing research context inside Notes9 so Catalyst AI can start working from it
        immediately.
      </p>
    ),
  },
  {
    question: "How is my research data stored and kept secure?",
    answer: (
      <p>
        All data is encrypted at rest and in transit. Your research data is yours — we never use it to train models or
        share it with third parties. Notes9 is built with a clear compliance roadmap including 21 CFR Part 11 readiness
        for teams moving toward regulated workflows. If your lab has specific data security requirements, raise them on
        the demo call and we will walk through our architecture in detail.
      </p>
    ),
  },
  {
    question: "Does Notes9 work for a solo researcher or only for teams?",
    answer: (
      <p>
        Both. Many early users are solo postdocs and independent researchers who want one place where their literature,
        lab notes, and writing stay connected. Team features — shared projects, collaborative protocols, multi-seat access
        — are there when you need them, but Notes9 works equally well for one person running their own projects.
      </p>
    ),
  },
  {
    question: "What tools can I stop using once I am on Notes9?",
    answer: (
      <>
        <p className="mb-0">Most research teams on Notes9 find they no longer need separate tools for:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Paper management — Zotero, Mendeley, or browser bookmarks for PDFs</li>
          <li>Lab notebooks — physical notebooks or scattered Word documents</li>
          <li>Protocol storage — Google Docs, Notion, or shared drives</li>
          <li>Data files — Dropbox or Drive folders of unlinked Excel files</li>
          <li>Report drafting — starting from a blank page in Word or Google Docs</li>
          <li>Generic AI tools — ChatGPT for research questions with no project context</li>
        </ul>
      </>
    ),
  },
  {
    question: "Is Catalyst AI a separate product or part of Notes9?",
    answer: (
      <p>
        Catalyst AI is built into Notes9 — it is not a separate subscription or add-on. It works across every part of the
        platform because it has access to everything in your project: the papers you have saved, the protocols you have
        written, the lab notes you have captured, and the data you have uploaded. That connected context is what makes
        it genuinely useful rather than a generic chatbot bolted on top.
      </p>
    ),
  },
  {
    question: "What happens if our lab's needs grow or change?",
    answer: (
      <p>
        Notes9 scales with the lab. Starting as one researcher and growing to a five-person team does not require
        migrating data or rebuilding projects — everything is already connected. For labs that need enterprise features
        like SSO, custom integrations, advanced PK/PD modelling, or a dedicated success manager, we will have a
        conversation and scope what makes sense.
      </p>
    ),
  },
]
