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
    <section id={id} className={cn("relative container mx-auto px-4 py-16 sm:px-6 sm:py-28 lg:px-8", className)}>
      {children}
    </section>
  )
}

/** The research lifecycle as a continuously scrolling chain, right under the hero. */
export function ConnectedChainSection() {
  return (
    <div className="border-y border-border/50 bg-background py-8">
      <div className="container mx-auto mb-5 px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[14px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
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
            title="You already use AI. It just can't see your work."
          />
          <p className="n9-readable mt-5 text-[20px] leading-8 text-muted-foreground">
            Researchers have embraced AI for reading and writing — but it works outside the lab,
            blind to your project. So you paste the same context in every week, the reasoning behind{" "}
            <em>why condition B</em> scatters, and months later no one can reconstruct it.
          </p>
        </div>
        <div className="relative">
          {/* Frosted scrim so the glyph cluster reads clearly over the
              sticky-note backdrop behind it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-5 rounded-3xl bg-background/50 backdrop-blur-[8px] dark:bg-background/40"
          />
          <div className="relative">
            <p className="mb-4 text-[14px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
              Your stack today
            </p>
            <ScatteredStack />
          </div>
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
  "Pasting the same context into ChatGPT every time",
  "Onboarding a new member takes weeks",
]
const WITH_NOTES9 = [
  "One traceable project memory",
  "Every result linked to its rationale",
  "Recall the full chain in seconds",
  "AI that already sees your project — and cites it",
  "Onboard a new member in minutes",
]

function BeforeAfter() {
  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-2">
      <Reveal3D>
        <div className="n9-card h-full p-7">
          <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Without Notes9
          </p>
          <ul className="mt-5 space-y-3.5">
            {WITHOUT_NOTES9.map((x) => (
              <li key={x} className="flex items-start gap-3 text-[16px] leading-6 text-muted-foreground">
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
          <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-[var(--n9-accent)]">
            With Notes9
          </p>
          <ul className="mt-5 space-y-3.5">
            {WITH_NOTES9.map((x) => (
              <li key={x} className="flex items-start gap-3 text-[16px] font-medium leading-6 text-foreground">
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
          description="Every paper, protocol, experiment and result, linked — so the reasoning is always one click away."
        />
        <Reveal3D className="mt-12">
          <MemoryHubFlow />
        </Reveal3D>
        <BeforeAfter />
      </Section>
    </div>
  )
}

/** The problem in numbers: AI adoption is high, yet research context still
 *  scatters and results still don't reproduce. Figures are sourced and cited. */
const PROBLEM_STATS = [
  { value: "84%", label: "of researchers now use AI in their work", cite: 1 },
  { value: "61%", label: "use it to find and summarise the latest research", cite: 2 },
  { value: "77%", label: "of biologists have failed to reproduce another lab's experiment", cite: 3 },
  { value: "50%+", label: "of scientists can't reproduce their own published results", cite: 3 },
]

const PROBLEM_SOURCES = [
  {
    n: 1,
    label: "Wiley, “ExplanAItions” researcher survey (2025) — AI use among researchers rose to 84%.",
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
      {/* Frosted scrim so the stats, labels and sources stay legible over the
          sticky-note backdrop behind them. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-1.25rem] bottom-[-1.25rem] top-6 rounded-3xl bg-background/50 backdrop-blur-[8px] dark:bg-background/40"
      />
      <div className="relative">
      <p className="mb-8 max-w-2xl text-[18px] leading-7 text-muted-foreground">
        AI adoption is already mainstream. The gap isn&rsquo;t whether researchers use AI — it&rsquo;s
        that their AI is disconnected from the work, so context still scatters and results still
        don&rsquo;t reproduce.
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
                <h3 className="mt-4 text-[16px] font-semibold text-foreground">{c.label}</h3>
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
        description="Your whole project lives in one connected memory — so Catalyst gets complete, structured context automatically. No giant prompts required."
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
                  <h3 className="text-[18px] font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-2 text-[16px] leading-6 text-muted-foreground">{p.body}</p>
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
          description="Catalyst reasons over your lab in the language of the bench — every claim backed by a checkable source."
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
                    <p className="text-[18px] font-semibold text-foreground">{icp.who}</p>
                    <p className="text-[16px] text-muted-foreground">{icp.line}</p>
                  </div>
                </div>
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
        description="Not another static ELN. Not another empty AI chat. Notes9 is connected research memory your AI can actually read — and cite."
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

/** Pricing teaser — Free + Enterprise. */
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
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-semibold text-foreground">{tier.name}</h3>
              <span className="rounded-full border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-2.5 py-0.5 text-[14px] font-semibold uppercase tracking-wide text-[var(--n9-accent)]">
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
        description="Two plans, no surprises — a free researcher tier today, and Enterprise for lab-wide deployment, security and support."
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
    a: "Yes — the free tier is free during early access, no credit card. Teams and institutions that want shared workspaces, onboarding and security review can talk to us about Enterprise.",
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
            Turn scattered research work into{" "}
            <span className="n9-gradient-text">reusable scientific memory</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[18px] leading-7 text-muted-foreground">
            Preserve not just what happened, but why — from literature review to experiment to final
            report.
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
        </div>
      </div>
    </Section>
  )
}
