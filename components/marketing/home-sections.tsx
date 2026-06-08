import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Database,
  GraduationCap,
  Rocket,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SectionHeader } from "@/components/marketing/site-ui"
import {
  AcademicNarrative,
  AccelerateDiscovery,
  BioCatalystDemo,
  CatalystAnswerCard,
  ConnectedChainMarquee,
  DemoStoryStepper,
  ElnVsAiVsNotes9,
  MiniChatMock,
  MiniGraphMock,
  MiniNoteMock,
  MiniReportMock,
  Reveal3D,
  RoleUseCaseSwitcher,
  StartupNarrative,
  TiltCard,
} from "@/components/marketing/marketing-embeds"
import { MemoryHubFlow } from "@/components/marketing/flow-embeds"
import { ScatteredStack } from "@/components/marketing/app-glyphs"
import { AnimatedCounter } from "@/components/marketing/animated-counter"

function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn("container mx-auto px-4 py-20 sm:px-6 sm:py-28 lg:px-8", className)}>
      {children}
    </section>
  )
}

/** The research lifecycle as a continuously scrolling chain, right under the hero. */
export function ConnectedChainSection() {
  return (
    <div className="border-y border-border/50 bg-background py-8">
      <div className="container mx-auto mb-5 px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
          One connected thread, from first paper to final report
        </p>
      </div>
      <ConnectedChainMarquee />
    </div>
  )
}

/** The pain: a vivid scattered-context scenario beside the scattered→connected embed. */
export function PainSection() {
  return (
    <Section id="why">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <SectionHeader
            reveal
            badge="The problem"
            title="Your data survives. The reason behind it doesn't."
          />
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Protocol in one folder, plate map in a spreadsheet, rationale in a reference manager,
            notes somewhere else. Three months on, no one on the team can say{" "}
            <em>why condition B</em>.
          </p>
        </div>
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
            Your stack today
          </p>
          <ScatteredStack />
        </div>
      </div>

      <ProblemStats />
    </Section>
  )
}

/** The fix — what Notes9 actually does for a research team. */
const WITHOUT_NOTES9 = [
  "Context scattered across five tools",
  "The “why” lost between people",
  "Weeks to reconstruct an old result",
  "Onboarding a new member takes weeks",
]
const WITH_NOTES9 = [
  "One traceable project memory",
  "Every result linked to its rationale",
  "Recall the full chain in seconds",
  "Onboard a new member in minutes",
]

function BeforeAfter() {
  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-2">
      <Reveal3D>
        <div className="n9-card h-full p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Without Notes9
          </p>
          <ul className="mt-5 space-y-3.5">
            {WITHOUT_NOTES9.map((x) => (
              <li key={x} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
                  <X className="h-3 w-3" />
                </span>
                {x}
              </li>
            ))}
          </ul>
        </div>
      </Reveal3D>
      <Reveal3D delay={0.1}>
        <div className="relative h-full overflow-hidden rounded-3xl border border-[var(--n9-accent)]/30 bg-[linear-gradient(135deg,var(--n9-accent-light),color-mix(in_oklab,var(--n9-accent)_10%,var(--card)))] p-7 shadow-[0_36px_100px_-46px_var(--n9-accent-glow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--n9-accent)]">
            With Notes9
          </p>
          <ul className="mt-5 space-y-3.5">
            {WITH_NOTES9.map((x) => (
              <li key={x} className="flex items-start gap-3 text-sm font-medium leading-6 text-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--n9-accent)] text-white">
                  <Check className="h-3 w-3" />
                </span>
                {x}
              </li>
            ))}
          </ul>
        </div>
      </Reveal3D>
    </div>
  )
}

export function SolutionSection() {
  return (
    <div className="relative overflow-hidden border-y border-border/50 bg-muted/20">
      <Section id="how" className="relative z-10">
        <SectionHeader
          reveal
          gradient
          align="center"
          className="mx-auto"
          badge="The fix"
          title="One connected memory for your whole team"
          description="Notes9 links every paper, protocol, experiment, note and result — so the reasoning behind your work is always one click away, for everyone."
        />
        <Reveal3D className="mt-12">
          <MemoryHubFlow />
        </Reveal3D>
        <BeforeAfter />
      </Section>
    </div>
  )
}

/** Quantify the cost of scattered research context (grounded in real data). */
const PROBLEM_STATS = [
  {
    value: "77%",
    label: "of biologists have tried and failed to reproduce another lab's experiment",
  },
  {
    value: "50%+",
    label: "of scientists can't even reproduce their own published results",
  },
  {
    value: "5+",
    label: "disconnected tools where a single project's context quietly gets lost",
  },
]

function ProblemStats() {
  return (
    <div className="mt-16 border-t border-border/50 pt-12">
      <div className="grid gap-8 sm:grid-cols-3">
        {PROBLEM_STATS.map((s, i) => (
          <Reveal3D key={s.value} delay={i * 0.08}>
            <div className="text-center sm:text-left">
              <AnimatedCounter
                value={s.value}
                className="font-serif text-5xl font-bold tracking-tight text-[var(--n9-accent)] sm:text-6xl"
              />
              <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-muted-foreground sm:mx-0">
                {s.label}
              </p>
            </div>
          </Reveal3D>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted-foreground/60">
        Reproducibility figures: Nature survey of 1,576 researchers (2016).
      </p>
    </div>
  )
}

/** Concrete demo story — the antibody-expression walkthrough. */
export function DemoStorySection() {
  return (
    <div className="border-y border-border/50 bg-muted/20">
      <Section id="how">
        <SectionHeader
          reveal
          align="center"
          className="mx-auto"
          badge="See it on a real project"
          title="Eight papers to a cited PI update"
          description="One antibody-expression project, captured end to end — every step linked to its source."
        />
        <div className="mt-12">
          <DemoStoryStepper />
        </div>
      </Section>
    </div>
  )
}

/** Capability bento — illustrative mini-mockups, almost no copy. */
const CAPS = [
  { label: "Read & cite papers", mock: <MiniNoteMock /> },
  { label: "Ask your lab, get sources", mock: <MiniChatMock /> },
  { label: "See how it connects", mock: <MiniGraphMock /> },
  { label: "Generate cited reports", mock: <MiniReportMock /> },
]

export function OutcomesSection() {
  return (
    <Section id="outcomes">
      <SectionHeader reveal gradient align="center" className="mx-auto" badge="What you can do" title="Less typing. More science." />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CAPS.map((c, i) => (
          <Reveal3D key={c.label} delay={i * 0.08} className="h-full">
            <TiltCard className="h-full">
              <div className="n9-card flex h-full flex-col p-5">
                <div className="[transform:translateZ(40px)]">{c.mock}</div>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{c.label}</h3>
              </div>
            </TiltCard>
          </Reveal3D>
        ))}
      </div>
    </Section>
  )
}

/** Context engineering advantage — one platform → complete AI context. */
const CONTEXT_POINTS = [
  {
    icon: Database,
    title: "One source of truth",
    body: "Papers, protocols, experiments, notes and results live together — not across five apps.",
  },
  {
    icon: Share2,
    title: "Structured & linked",
    body: "Everything is connected, so Catalyst gets precise context — not a pile of files to guess from.",
  },
  {
    icon: BadgeCheck,
    title: "Grounded, cited answers",
    body: "It reasons over your real work and shows its sources, so you can trust — and verify — the output.",
  },
]

export function ContextEngineeringSection() {
  return (
    <Section id="context">
      <SectionHeader
        reveal
        gradient
        align="center"
        className="mx-auto"
        badge="Why the AI is better"
        title="Better context, not bigger prompts"
        description="An AI is only as good as the context it's given. Because your whole project lives in one connected memory, Catalyst gets complete, structured context automatically — the discipline AI teams call context engineering, built into the platform."
      />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {CONTEXT_POINTS.map((p, i) => {
          const Icon = p.icon
          return (
            <Reveal3D key={p.title} delay={i * 0.08} className="h-full">
              <TiltCard className="h-full">
                <div className="n9-card flex h-full flex-col p-7">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--n9-accent)] text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{p.body}</p>
                </div>
              </TiltCard>
            </Reveal3D>
          )
        })}
      </div>
    </Section>
  )
}

/** Catalyst showcase — the interactive, biology-first AI demo with the mascot. */
export function CatalystShowcaseSection() {
  return (
    <div className="relative overflow-hidden border-y border-border/50 bg-muted/20 n9-glow">
      <Section id="catalyst" className="relative z-10">
        <SectionHeader
          reveal
          gradient
          align="center"
          className="mx-auto"
          badge="Catalyst AI"
          title="Biology-first AI that accelerates discovery"
          description="Catalyst reasons over your lab in the language of the bench — turning weeks of digging into days, with every claim backed by a checkable source."
        />
        <div className="mt-12 space-y-12">
          <Reveal3D>
            <AccelerateDiscovery />
          </Reveal3D>
          <Reveal3D delay={0.1}>
            <BioCatalystDemo />
          </Reveal3D>
        </div>
      </Section>
    </div>
  )
}

/** Catalyst — biology-first answers with citations you can check. */
export function CatalystSection() {
  return (
    <Section id="catalyst">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <div>
          <SectionHeader
            reveal
            badge="Catalyst AI"
            title="Generic AI answers questions. Catalyst answers from your lab."
          />
          <ul className="mt-6 space-y-4">
            {[
              "Biology-first by design — biological questions get biology-specific answers, and that's where its accuracy is strongest.",
              "Every response lists its sources at the bottom — your internal documents and web results — so you can verify each claim instead of trusting a black box.",
              "Drag a saved paper straight into Catalyst to ask questions grounded in that exact source.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                  <Check className="h-3 w-3" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <TiltCard>
          <CatalystAnswerCard />
        </TiltCard>
      </div>
    </Section>
  )
}

/** Benefits for the two core ICPs — academics and startup labs. */
const ICPS = [
  {
    icon: GraduationCap,
    who: "For academics",
    line: "PhDs · postdocs · PIs",
    mock: <AcademicNarrative />,
    chips: ["Defend results", "Cited drafts", "Fast onboarding"],
  },
  {
    icon: Rocket,
    who: "For startup labs",
    line: "Biotech R&D",
    mock: <StartupNarrative />,
    chips: ["Knowledge retained", "Decision trail", "Audit-friendly"],
  },
]

export function IcpBenefitsSection() {
  return (
    <Section id="who-for">
      <SectionHeader
        reveal
        gradient
        align="center"
        className="mx-auto"
        badge="Who it's for"
        title="Built for the people who live in the lab"
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {ICPS.map((icp, i) => {
          const Icon = icp.icon
          return (
            <Reveal3D key={icp.who} delay={i * 0.1}>
            <TiltCard max={4}>
              <div className="n9-card flex h-full flex-col p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--n9-accent)] text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">{icp.who}</p>
                    <p className="text-sm text-muted-foreground">{icp.line}</p>
                  </div>
                </div>
                <div className="mt-5 [transform:translateZ(34px)]">{icp.mock}</div>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {icp.chips.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)] px-2.5 py-1 text-xs font-medium text-[var(--n9-accent)]"
                    >
                      <Check className="h-3 w-3" />
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </TiltCard>
            </Reveal3D>
          )
        })}
      </div>
    </Section>
  )
}

/** Use cases by role. */
export function UseCasesSection() {
  return (
    <div className="border-y border-border/50 bg-muted/20">
      <Section id="use-cases">
        <SectionHeader
          reveal
          badge="Made for your role"
          title="Whatever you're trying to get done today"
        />
        <div className="mt-10">
          <RoleUseCaseSwitcher />
        </div>
      </Section>
    </div>
  )
}

/** Differentiation: ELN vs AI chat vs Notes9. */
export function DifferentiationSection() {
  return (
    <Section id="different">
      <SectionHeader
        reveal
        gradient
        align="center"
        className="mx-auto"
        badge="Why Notes9"
        title="ELNs record what happened. Notes9 remembers why."
      />
      <Reveal3D className="mx-auto mt-10 max-w-3xl">
        <TiltCard max={4}>
          <ElnVsAiVsNotes9 />
        </TiltCard>
      </Reveal3D>
    </Section>
  )
}

/** Honest trust / data-handling framing. */
export function TrustSection() {
  return (
    <Section id="trust">
      <div className="rounded-2xl border border-border/50 bg-card/70 p-8 backdrop-blur-sm sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-start">
          <div>
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
              Honest about where Notes9 fits today
            </h2>
          </div>
          <div className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p>
              Notes9 is currently best suited for <span className="font-medium text-foreground">non-clinical research workflow pilots</span> —
              literature-linked project organisation, protocol planning, experiment tracking, and
              internal research documentation.
            </p>
            <p>
              It is <span className="font-medium text-foreground">not</span> yet positioned as a regulated ELN
              replacement for GMP/GLP environments, and you shouldn't upload patient data, special-category
              data, or export-controlled material during the pilot.
            </p>
            <p>
              That honesty is the point: your research context is connected and traceable, and we're clear
              about the compliance path rather than overpromising it.
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}

/** Pricing teaser — Free + Lab/Institution, early access. */
const PRICING = [
  {
    name: "Free — Researcher",
    tag: "Early access",
    price: "Free",
    blurb: "For individual researchers and small teams testing Notes9 on one workflow.",
    cta: { label: "Start free", href: "/auth/sign-up" },
    primary: true,
    points: [
      "Full product on one live workflow",
      "Projects, experiments, lab notes, protocols, samples",
      "Catalyst AI with cited answers",
      "No credit card",
    ],
  },
  {
    name: "Lab & Institution",
    tag: "Design partner",
    price: "Let's talk",
    blurb: "For labs, biotech and universities that want onboarding and shared workspaces.",
    cta: { label: "Book a demo", href: "/#contact" },
    primary: false,
    points: [
      "Onboarding & workflow mapping",
      "Shared projects across the team",
      "Data controls, security review, SSO",
      "Free while in early access",
    ],
  },
]

export function PricingTiers() {
  return (
    <>
      <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
        {PRICING.map((tier, i) => (
          <Reveal3D key={tier.name} delay={i * 0.1} className="h-full">
          <TiltCard max={4} className="h-full">
          <div
            className={cn(
              "flex h-full flex-col rounded-2xl border p-7",
              tier.primary
                ? "border-[var(--n9-accent)]/40 bg-[var(--n9-accent-light)]/60 shadow-[0_24px_60px_-30px_var(--n9-accent-glow)]"
                : "border-border/60 bg-card/70",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
              <span className="rounded-full border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--n9-accent)]">
                {tier.tag}
              </span>
            </div>
            <div className="mt-3 font-serif text-3xl text-foreground">{tier.price}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{tier.blurb}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {tier.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--n9-accent)]" />
                  {p}
                </li>
              ))}
            </ul>
            <Button
              asChild
              size="lg"
              variant={tier.primary ? "default" : "outline"}
              className={cn(
                "mt-7 h-11 rounded-full",
                tier.primary &&
                  "bg-[var(--n9-accent)] text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]",
              )}
            >
              <Link href={tier.cta.href}>
                {tier.cta.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          </TiltCard>
          </Reveal3D>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground/70">
        A middle “Team” tier is on the way. Until then, every feature is available free while we’re in
        early access.
      </p>
    </>
  )
}

export function PricingTeaserSection() {
  return (
    <Section id="pricing">
      <SectionHeader
        reveal
        align="center"
        className="mx-auto"
        badge="Pricing"
        title="Start free. Talk to us when you scale."
        description="No hard prices yet — a clear path from a solo pilot to a lab-wide deployment."
      />
      <div className="mt-10">
        <PricingTiers />
      </div>
    </Section>
  )
}

/** FAQ — native details/summary, no extra deps. */
const FAQS = [
  {
    q: "Is it free?",
    a: "Yes — the Researcher tier is free during early access, no credit card. Labs and institutions that want onboarding, shared workspaces and security review can book a demo.",
  },
  {
    q: "Is this an ELN, a literature tool, or an AI assistant?",
    a: "All of those, connected. Notes9 ties papers, protocols, experiments, notes, samples and reports into one traceable project memory, with Catalyst AI reasoning over that context.",
  },
  {
    q: "Can I try it on my own first?",
    a: "Absolutely. Start free, pick one live workflow (say, a literature review into an experiment report), and see how retrieval and reporting feel before involving your team.",
  },
  {
    q: "Can I put sensitive or clinical data in it?",
    a: "Not during the pilot. Notes9 is for non-clinical research workflows right now — please don't upload patient data, special-category data, or export-controlled material.",
  },
  {
    q: "How is it different from ChatGPT or a normal ELN?",
    a: "An ELN records what happened; a generic AI chat forgets your context between sessions. Notes9 remembers why — it answers from your lab's connected research memory and traces every output back to its sources.",
  },
]

export function FaqSection() {
  return (
    <Section id="faq">
      <SectionHeader reveal align="center" className="mx-auto" badge="FAQ" title="Questions, answered plainly" />
      <div className="mx-auto mt-10 max-w-2xl divide-y divide-border/60 rounded-2xl border border-border/60 bg-card/60">
        {FAQS.map((f) => (
          <details key={f.q} className="group px-5 py-4 sm:px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-foreground">
              {f.q}
              <span className="text-[var(--n9-accent)] transition-transform duration-200 group-open:rotate-45">
                <ArrowRight className="h-4 w-4 rotate-45" />
              </span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

/** Final CTA. */
export function FinalCtaSection() {
  return (
    <Section>
      <div className="relative overflow-hidden rounded-3xl border border-[var(--n9-accent)]/30 bg-[linear-gradient(135deg,var(--n9-accent-light),color-mix(in_oklab,var(--n9-accent)_9%,var(--card)))] p-10 text-center shadow-[0_44px_130px_-54px_var(--n9-accent-glow)] n9-glow sm:p-14">
        <div className="relative z-10">
          <h2 className="mx-auto max-w-2xl font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Turn scattered research work into{" "}
            <span className="n9-gradient-text">reusable scientific memory</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Preserve not just what happened, but why — from literature review to experiment to final
            report.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-[linear-gradient(115deg,var(--n9-accent),color-mix(in_oklab,var(--n9-accent)_58%,#d9a24a))] px-8 text-white shadow-[0_16px_44px_-14px_var(--n9-accent-glow)] hover:opacity-95"
            >
              <Link href="/auth/sign-up">
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-8">
              <Link href="/#contact">Book a 15-min demo</Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  )
}
