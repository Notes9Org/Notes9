import Link from "next/link"
import {
  ArrowRight,
  Check,
  GraduationCap,
  Rocket,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SectionHeader } from "@/components/marketing/site-ui"
import {
  AcademicNarrative,
  CatalystAnswerCard,
  DemoStoryStepper,
  ElnVsAiVsNotes9,
  Reveal3D,
  RoleUseCaseSwitcher,
  StartupNarrative,
  TiltCard,
} from "@/components/marketing/marketing-embeds"
import { LinkedRecordsMap } from "@/components/marketing/flow-embeds"
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
    <section id={id} className={cn("relative container mx-auto px-4 py-16 sm:px-6 sm:py-28 lg:px-8", className)}>
      {children}
    </section>
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
            title="You already use AI. It simply cannot see your work."
          />
          <p className="n9-readable mt-5 text-[20px] leading-8 text-muted-foreground">
            Researchers have embraced AI for reading and writing, but it works outside the lab,
            blind to the project. So the same context is pasted in week after week, the reasoning
            behind <em>why condition B</em> scatters, and months later no one can reconstruct it.
          </p>
        </div>
        <div className="relative">
          <p className="mb-4 text-[14px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
            Your stack today
          </p>
          <ScatteredStack />
        </div>
      </div>

      <ProblemStats />
    </Section>
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
          description="Every paper, protocol, experiment, and result is linked, so the reasoning is always one click away."
        />
        <Reveal3D className="mt-12">
          <LinkedRecordsMap />
        </Reveal3D>
      </Section>
    </div>
  )
}

/** The problem in numbers: AI adoption is high, yet research context still
 *  scatters and results still don't reproduce. Figures are sourced and cited. */
const PROBLEM_STATS = [
  { value: "84%", label: "of researchers now use AI in their work", cite: 1 },
  { value: "7%", label: "trust AI for their research - because nothing connects it to their own work", cite: 2 },
  { value: "77%", label: "of biologists have failed to reproduce another lab's experiment", cite: 3 },
  { value: "50%+", label: "of scientists cannot reproduce their own published results", cite: 3 },
]

const PROBLEM_SOURCES = [
  {
    n: 1,
    label: "Wiley, “ExplanAItions” researcher survey (2025): AI use among researchers rose to 84%.",
    href: "https://www.businesswire.com/news/home/20251007928124/en/AI-Adoption-Jumps-to-84-Among-Researchers-as-Expectations-Undergo-Significant-Reality-Check",
  },
  {
    n: 2,
    label: "Elsevier, “Researcher of the Future” global survey of 3,200+ researchers (2025).",
    href: "https://www.elsevier.com/about/press-releases/elseviers-global-survey-of-3-000-researchers-reveals-less-than-half-have",
  },
  {
    n: 3,
    label: "Baker, M. “1,500 scientists lift the lid on reproducibility.” Nature 533, 452–454 (2016).",
    href: "https://www.nature.com/articles/533452a",
  },
]

const sourceHref = (n: number) => PROBLEM_SOURCES.find((s) => s.n === n)?.href

function ProblemStats() {
  return (
    <div className="relative mt-16 border-t border-border/50 pt-12">
      <div className="relative">
      <p className="mb-8 max-w-2xl text-[18px] leading-7 text-muted-foreground">
        Adoption is here; trust is the gap. Researchers have embraced AI, yet barely any trust it for
        their actual research - because every tool is disconnected from their work, so context still
        scatters and results still fail to reproduce.
      </p>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {PROBLEM_STATS.map((s, i) => (
          <Reveal3D key={s.label} delay={i * 0.08}>
            <div className="text-center sm:text-left">
              <AnimatedCounter
                value={s.value}
                className="font-serif text-5xl font-bold tracking-tight text-[var(--n9-accent)] sm:text-6xl"
              />
              <p className="mx-auto mt-3 max-w-xs text-[16px] leading-6 text-muted-foreground sm:mx-0">
                {s.label}
                <sup>
                  <a
                    href={sourceHref(s.cite)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-0.5 font-semibold text-[var(--n9-accent)] hover:underline"
                  >
                    {s.cite}
                  </a>
                </sup>
              </p>
            </div>
          </Reveal3D>
        ))}
      </div>
      <div className="mt-10 border-t border-border/50 pt-6">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
          Sources
        </p>
        <ol className="mt-3 space-y-1.5">
          {PROBLEM_SOURCES.map((src) => (
            <li key={src.n} className="text-[13px] leading-5 text-muted-foreground/70">
              <span className="font-semibold text-[var(--n9-accent)]">{src.n}.</span>{" "}
              <a
                href={src.href}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground hover:underline"
              >
                {src.label}
              </a>
            </li>
          ))}
        </ol>
      </div>
      </div>
    </div>
  )
}

/** Concrete demo story - the antibody-expression walkthrough. */
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
          description="One antibody-expression project, captured end to end, with every step linked to its source."
        />
        <div className="mt-12">
          <DemoStoryStepper />
        </div>
      </Section>
    </div>
  )
}

/** Catalyst - biology-first answers with citations you can check. */
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
              "Biology-first by design: biological questions receive biology-specific answers, which is where its accuracy is strongest.",
              "Every response lists its sources at the bottom (your internal documents and web results), so you can verify each claim instead of trusting a black box.",
              "Drag a saved paper straight into Catalyst to ask questions grounded in that exact source.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[16px] leading-6 text-muted-foreground">
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

/** Benefits for the two core ICPs - academics and startup labs. */
const ICPS = [
  {
    icon: GraduationCap,
    who: "For academics",
    line: "PhDs · postdocs · PIs",
    blurb: "Literature and writing that know your project, with every claim cited - so papers move faster and a student leaving doesn’t take the project’s memory.",
    mock: <AcademicNarrative />,
    chips: ["Defend results", "Cited drafts", "Fast onboarding"],
  },
  {
    icon: Rocket,
    who: "For early-stage lab startups",
    line: "Pre-seed biotech R&D",
    blurb: "Set up your lab’s brain on day one - a 3-person team that moves like a 10-person one, with a clean, investor-ready record of everything you’ve done.",
    mock: <StartupNarrative />,
    chips: ["Knowledge retained", "Decision trail", "Investor-ready"],
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
        badge="Who it is for"
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
                    <p className="text-[18px] font-semibold text-foreground">{icp.who}</p>
                    <p className="text-[16px] text-muted-foreground">{icp.line}</p>
                  </div>
                </div>
                <p className="mt-4 text-[16px] leading-6 text-muted-foreground">{icp.blurb}</p>
                <div className="mt-5 [transform:translateZ(34px)]">{icp.mock}</div>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {icp.chips.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)] px-2.5 py-1 text-[14px] font-medium text-[var(--n9-accent)]"
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
          title="Whatever you are trying to get done today"
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
      <div className="rounded-2xl border border-border/50 bg-card p-8 backdrop-blur-sm sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-start">
          <div>
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
              Honest about where Notes9 fits today
            </h2>
          </div>
          <div className="space-y-4 text-[16px] leading-7 text-muted-foreground">
            <p>
              Notes9 is currently best suited for <span className="font-medium text-foreground">non-clinical research workflow pilots</span> -
              literature-linked project organisation, protocol planning, experiment tracking, and
              internal research documentation.
            </p>
            <p>
              It is <span className="font-medium text-foreground">not</span> yet positioned as a regulated ELN
              replacement for GMP/GLP environments, and you should not upload patient data, special-category
              data, or export-controlled material during the pilot.
            </p>
            <p>
              That honesty is the point: your research context is connected and traceable, and we are clear
              about the compliance path rather than overpromising it.
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}

/** Pricing teaser - Free + Enterprise. */
const PRICING = [
  {
    name: "Free",
    tag: "For researchers",
    price: "Free",
    blurb: "For individual researchers and small teams building their first connected project memory.",
    cta: { label: "Start free", href: "/auth/sign-up" },
    primary: true,
    points: [
      "Full product on a live workflow",
      "Projects, experiments, lab notes, protocols, samples",
      "Catalyst AI with cited answers",
      "No credit card",
    ],
  },
  {
    name: "Enterprise",
    tag: "For teams & institutions",
    price: "Custom",
    blurb: "For labs, biotech and universities that need shared workspaces, onboarding and security review.",
    cta: { label: "Talk to us", href: "/#contact" },
    primary: false,
    points: [
      "Shared projects across your whole team",
      "Onboarding & workflow mapping",
      "Data controls, security review, SSO",
      "Priority support & design-partner pilots",
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
                : "border-border/60 bg-card",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h3 className="text-[20px] font-semibold text-foreground">{tier.name}</h3>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--n9-accent)]">
                {tier.tag}
              </span>
            </div>
            <div className="mt-3 font-serif text-3xl text-foreground">{tier.price}</div>
            <p className="mt-2 text-[16px] leading-6 text-muted-foreground">{tier.blurb}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {tier.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[16px] leading-6 text-muted-foreground">
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
      <p className="mx-auto mt-6 max-w-2xl text-center text-[14px] text-muted-foreground/70">
        Every feature is free while we’re in early access. Enterprise adds team-wide deployment,
        security review and onboarding support when your lab is ready to scale.
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
        title="Start free. Go Enterprise when you scale."
        description="Two plans, no surprises: a free researcher tier today, and Enterprise for lab-wide deployment, security, and support."
      />
      <div className="mt-10">
        <PricingTiers />
      </div>
    </Section>
  )
}

/** FAQ - native details/summary, no extra deps. */
const FAQS = [
  {
    q: "Is it free?",
    a: "Yes. The free tier is free during early access, with no credit card required. Teams and institutions that want shared workspaces, onboarding, and security review can contact us about Enterprise.",
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
    a: "Not during the pilot. Notes9 is currently intended for non-clinical research workflows, so please do not upload patient data, special-category data, or export-controlled material.",
  },
  {
    q: "How is it different from ChatGPT or a normal ELN?",
    a: "An ELN records what happened; a generic AI chat forgets your context between sessions. Notes9 remembers why: it answers from your lab's connected research memory and traces every output back to its sources.",
  },
]

export function FaqSection() {
  return (
    <Section id="faq">
      <SectionHeader reveal align="center" className="mx-auto" badge="FAQ" title="Questions, answered plainly" />
      <div className="mx-auto mt-10 max-w-2xl divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
        {FAQS.map((f) => (
          <details key={f.q} className="group px-5 py-4 sm:px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-foreground">
              {f.q}
              <span className="text-[var(--n9-accent)] transition-transform duration-200 group-open:rotate-45">
                <ArrowRight className="h-4 w-4 rotate-45" />
              </span>
            </summary>
            <p className="mt-3 text-[16px] leading-6 text-muted-foreground">{f.a}</p>
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
            Your whole career, from first paper to{" "}
            <span className="n9-gradient-text">published one</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[18px] leading-7 text-muted-foreground">
            A researcher’s entire project - papers, experiments, data, notes - lives in Notes9, so its
            AI knows your research and cites every claim.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-14 w-full rounded-full bg-[linear-gradient(115deg,var(--n9-accent),color-mix(in_oklab,var(--n9-accent)_58%,#d9a24a))] px-10 text-[17px] font-semibold text-white shadow-[0_16px_44px_-14px_var(--n9-accent-glow)] hover:opacity-95 sm:w-auto"
            >
              <Link href="/auth/sign-up">
                Start free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 w-full rounded-full px-10 text-[17px] font-semibold sm:w-auto">
              <Link href="/#contact">Book a 15-min demo</Link>
            </Button>
          </div>
          <p className="mt-5 text-[14px] text-muted-foreground/80">
            Free for students and postdocs · under a minute to start.
          </p>
        </div>
      </div>
    </Section>
  )
}
