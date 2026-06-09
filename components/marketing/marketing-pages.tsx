"use client"
import {
  BookOpen,
  Bot,
  Check,
  Database,
  FileSearch,
  FileText,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Microscope,
  Minus,
  Settings,
  ShieldCheck,
  TestTube2,
  Users,
  Workflow,
} from "lucide-react"

import {
  CTAPanel,
  FeatureCard,
  LinkCard,
  MarketingPageFrame,
  PageHero,
  SectionHeader,
  WorkflowStep,
} from "@/components/marketing/site-ui"
import { MinimalCard, ProductFrame } from "@/components/marketing/three-d-card"
import { ProductShowcase } from "@/components/marketing/video-showcase"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  DemoStorySection,
  FaqSection,
  PricingTiers,
  UseCasesSection,
} from "@/components/marketing/home-sections"

const cta = "/#contact"
const resourceGuides = [
  {
    id: "projects",
    title: "Projects",
    description: "Organize research into structured projects that hold experiments, notes, and supporting context together.",
    icon: LayoutDashboard,
    bullets: [
      "Create a project with a clear objective, owner, timeline, and working description.",
      "Use the project as the parent layer for experiments, linked notes, and reporting context.",
      "Review status and progress from one place instead of reconstructing updates manually.",
    ],
  },
  {
    id: "experiments",
    title: "Experiments",
    description: "Capture execution details, protocol context, and outcomes in a reusable experimental record.",
    icon: FlaskConical,
    bullets: [
      "Create experiments inside the relevant project so execution stays tied to purpose.",
      "Link protocols where needed and document deviations or observations as the work unfolds.",
      "Attach files, data, and outcomes directly to the experiment rather than scattering them across tools.",
    ],
  },
  {
    id: "protocols",
    title: "Protocols",
    description: "Build reusable SOPs and process templates that improve consistency across teams.",
    icon: FileText,
    bullets: [
      "Version protocols so teams know which procedure is current.",
      "Keep categories and naming conventions consistent for retrieval.",
      "Reuse protocols inside experiments to reduce setup friction and improve reproducibility.",
    ],
  },
  {
    id: "samples",
    title: "Samples",
    description: "Track physical materials, storage context, and experimental relationships in one inventory flow.",
    icon: TestTube2,
    bullets: [
      "Register samples with clear identifiers, type, storage details, and origin.",
      "Link samples to relevant experiments so material provenance stays visible.",
      "Use the sample record as the durable reference point for future work and review.",
    ],
  },
  {
    id: "lab-notes",
    title: "Lab Notes",
    description: "Record day-to-day observations and working notes without losing experiment context.",
    icon: BookOpen,
    bullets: [
      "Create notes inside experiment workflows so daily documentation stays attached to active work.",
      "Use the editor to capture observations, rationale, and supporting evidence in one place.",
      "Retrieve existing notes later from the lab notes workspace instead of searching across disconnected documents.",
    ],
  },
  {
    id: "literature",
    title: "Literature Reviews",
    description: "Search, stage, save, and review papers while preserving why they matter to the project.",
    icon: FileSearch,
    bullets: [
      "Use live search to find relevant papers and review ranked results before saving anything.",
      "Stage the strongest papers before adding them to the repository.",
      "Keep personal notes and relevance judgments alongside the citation rather than in a separate system.",
    ],
  },
  {
    id: "catalyst",
    title: "Catalyst AI",
    description: "Use AI assistance where it accelerates retrieval, drafting, and synthesis without replacing oversight.",
    icon: Bot,
    bullets: [
      "Summarize documents, draft structured content, or explore hypotheses from the current workflow context.",
      "Treat outputs as accelerants for serious work, not substitutes for scientific review.",
      "Use the surrounding project and note structure to keep AI interactions grounded in real work.",
    ],
  },
  {
    id: "settings",
    title: "Settings and Workspace",
    description: "Manage workspace preferences, account details, and data operations in one place.",
    icon: Settings,
    bullets: [
      "Update profile and workspace preferences without disrupting active work.",
      "Review data transfer and account controls from a predictable settings surface.",
      "Use this area for governance and maintenance, not workflow execution.",
    ],
  },
]

const resourceFaqs = [
  {
    question: "Where should a new team start?",
    answer:
      "Start with one active workflow that already suffers from context loss. Set up a project, create the experiment structure, and document one real note trail before trying to model everything.",
  },
  {
    question: "Should teams begin with literature, experiments, or notes?",
    answer:
      "Begin where the current pain is strongest. If evidence retrieval is the main problem, start with literature. If execution handoffs are weak, start with experiments and lab notes.",
  },
  {
    question: "How should Notes9 be evaluated?",
    answer:
      "Evaluate it against a live workflow rather than a generic feature checklist. Compare retrieval speed, reporting effort, and how much context remains attached after real work is recorded.",
  },
]

const platformVideoClips = [
  {
    title: "Find signal faster",
    description: "Search, stage, and review the papers that matter without breaking the workflow.",
    video: "/demo/platform-literature-search.mp4",
    poster: "/demo/light/literature-search.png",
    icon: FileSearch,
    eyebrow: "Literature",
  },
  {
    title: "See the work in context",
    description: "Track linked records and context trails instead of reconstructing what happened later.",
    video: "/demo/platform-research-map.mp4",
    poster: "/demo/light/experiment-details.png",
    icon: FlaskConical,
    eyebrow: "Experiments",
  },
  {
    title: "Follow the research graph",
    description: "Move through connected project structure with a visual map of the workflow.",
    video: "/demo/platform-experiments.mp4",
    poster: "/demo/light/research-map.png",
    icon: FolderKanban,
    eyebrow: "Research Map",
  },
  {
    title: "Turn sources into writing",
    description: "Read, annotate, and move from evidence to output in one continuous workspace.",
    video: "/demo/platform-writing.mp4",
    poster: "/demo/light/writing.png",
    icon: FileText,
    eyebrow: "Writing",
  },
]

export function AboutMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="About Notes9"
        title={
          <>
            Built for research teams that need{" "}
            <span className="text-[var(--n9-accent)]">continuity, provenance, and clarity</span>.
          </>
        }
        description="Notes9 exists because critical research context still gets lost between papers, notebooks, files, and reporting tools."
        actions={[
          { href: "/platform", label: "Explore the platform" },
          { href: cta, label: "Request a demo", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Why we exist" title="Give research teams a memory they can trust." />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard icon={Workflow} title="Continuity by design" description="We keep the full research trail — literature, decisions, experiments, and reporting — connected as one memory." />
            <FeatureCard icon={Database} title="Provenance you can inspect" description="Every output stays tied to the evidence behind it, so work can always be traced and reused." />
            <FeatureCard icon={ShieldCheck} title="Trustworthy assistance" description="AI support is most useful when researchers can inspect provenance, preserve oversight, and reuse context safely." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Principles" title="What guides the product" />
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <FeatureCard icon={Database} title="Provenance by default" description="Outputs stay tied to the papers, records, and workflow events that produced them." />
            <FeatureCard icon={BookOpen} title="Scientific memory" description="Institutional knowledge becomes easier to retrieve as projects evolve, not harder." />
            <FeatureCard icon={Microscope} title="Workflow-aware design" description="Built around actual lab operations rather than generic AI chat abstractions." />
            <FeatureCard icon={Users} title="Adoption-friendly UX" description="Clarity and disciplined interfaces matter when teams are documenting serious work." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
            <MinimalCard className="h-full">
              <p className="text-[14px] font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">Mission</p>
              <p className="mt-4 text-[20px] leading-8 text-foreground">Make rigorous scientific work easier to run, trace, and reuse across the full research cycle.</p>
            </MinimalCard>
            <MinimalCard className="h-full">
              <p className="text-[14px] font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">Vision</p>
              <p className="mt-4 text-[20px] leading-8 text-foreground">Give every research team a trusted operating layer for decisions, documentation, and discovery.</p>
            </MinimalCard>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="See how Notes9 fits your workflow."
            description="We can walk through the points where your current process loses context, adds manual effort, or makes retrieval harder."
            primary={{ href: cta, label: "Request a demo" }}
            secondary={{ href: "/pricing", label: "Review engagement options" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

export function PlatformMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Platform"
        title={
          <>
            One connected layer for{" "}
            <span className="text-[var(--n9-accent)]">literature, lab work, memory, and reporting</span>.
          </>
        }
        description="Capture work in structure, retrieve context in seconds, and move from scattered notes to decision-ready outputs — with every step traceable."
        actions={[
          { href: "/auth/sign-up", label: "Start free" },
          { href: cta, label: "Book a demo", variant: "outline" },
        ]}
      />

      <ProductShowcase />

      <UseCasesSection />

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="See Notes9"
            title="Short product moments"
            description="How scattered lab work becomes one continuous, connected system."
            align="center"
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {platformVideoClips.map((clip) => (
              <MinimalCard
                key={clip.title}
                className="group overflow-hidden rounded-[28px] border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,239,233,0.88))] p-0 shadow-[0_28px_80px_-34px_rgba(44,36,24,0.18)] transition-transform duration-300 hover:-translate-y-1 dark:bg-[linear-gradient(180deg,rgba(24,20,16,0.96),rgba(36,28,22,0.9))] dark:shadow-[0_28px_80px_-34px_rgba(0,0,0,0.45)]"
              >
                <div className="px-5 py-5">
                  <div className="mb-4 inline-flex rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)] px-3 py-1 text-[14px] font-semibold uppercase tracking-[0.24em] text-[var(--n9-accent)]">
                    {clip.eyebrow}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)] transition-transform duration-300 group-hover:scale-105">
                      <clip.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[20px] font-semibold tracking-tight text-foreground">{clip.title}</h3>
                      <p className="mt-1 text-[16px] leading-6 text-muted-foreground">{clip.description}</p>
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <ProductFrame className="overflow-hidden rounded-[24px] border-border/60 bg-[#060606] shadow-[0_24px_60px_-34px_rgba(12,10,8,0.6)] [transform:none] hover:[transform:none]">
                    <div className="flex h-9 items-center gap-2 border-b border-white/10 bg-[#111111] px-4">
                      <div className="flex gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-[#ff6b5f]" />
                        <div className="h-2.5 w-2.5 rounded-full bg-[#f8c14d]" />
                        <div className="h-2.5 w-2.5 rounded-full bg-[#45d483]" />
                      </div>
                      <div className="ml-3 h-5 flex-1 rounded-full bg-white/5" />
                    </div>
                    <div className="relative aspect-[16/10] bg-[#080808]">
                      <video
                        src={clip.video}
                        title={clip.title}
                        className="block h-full w-full bg-black object-cover object-center"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        poster={clip.poster}
                      />
                    </div>
                  </ProductFrame>
                </div>
              </MinimalCard>
            ))}
          </div>
        </div>
      </section>

      <DemoStorySection />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="See the platform through your own workflow."
            description="We can map Notes9 against your current process to show where value lands first."
            primary={{ href: "/auth/sign-up", label: "Start free" }}
            secondary={{ href: cta, label: "Book a demo" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

const PRICING_INCLUDED = [
  { cap: "Projects, experiments, lab notes, protocols, samples", free: true, lab: true },
  { cap: "Catalyst AI with cited answers", free: true, lab: true },
  { cap: "Literature reader, PDF reading & annotations", free: true, lab: true },
  { cap: "Research map", free: true, lab: true },
  { cap: "Shared projects across a team", free: false, lab: true },
  { cap: "Onboarding & workflow mapping", free: false, lab: true },
  { cap: "Data controls, security review, SSO", free: false, lab: true },
]

export function PricingMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Pricing"
        title={
          <>
            Start free.{" "}
            <span className="text-[var(--n9-accent)]">Go Enterprise</span> when your lab is ready.
          </>
        }
        description="Two plans, no surprises: a free researcher tier today, and Enterprise for lab-wide deployment, security review and onboarding when you scale."
        actions={[
          { href: "/auth/sign-up", label: "Start free" },
          { href: cta, label: "Talk to us", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <PricingTiers />
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            align="center"
            className="mx-auto"
            badge="What's included"
            title="Everything's open while we're in early access"
          />
          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card backdrop-blur-sm">
            <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr] items-center gap-1 border-b border-border/60 bg-muted/40 px-3 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground sm:gap-2 sm:px-6 sm:text-[14px]">
              <span>Capability</span>
              <span className="text-center">Free</span>
              <span className="text-center text-[var(--n9-accent)]">Enterprise</span>
            </div>
            {PRICING_INCLUDED.map((r, i) => (
              <div
                key={r.cap}
                className={`grid grid-cols-[1.6fr_0.7fr_0.7fr] items-center gap-1 px-3 py-3.5 text-[14px] sm:gap-2 sm:px-6 sm:text-[16px] ${i % 2 ? "bg-muted/20" : ""}`}
              >
                <span className="font-medium text-foreground">{r.cap}</span>
                <span className="flex justify-center">
                  {r.free ? (
                    <Check className="h-4 w-4 text-[var(--n9-accent)]" />
                  ) : (
                    <Minus className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </span>
                <span className="flex justify-center">
                  {r.lab ? (
                    <Check className="h-4 w-4 text-[var(--n9-accent)]" />
                  ) : (
                    <Minus className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FaqSection />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Start free, or bring your whole lab."
            description="Spin up a solo pilot today, or book a demo to map Notes9 across your team."
            primary={{ href: "/auth/sign-up", label: "Start free" }}
            secondary={{ href: cta, label: "Book a demo" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

export function DocsMarketingPage() {
  return <ResourcesMarketingPage />
}

export function ResourcesMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Resources"
        title={
          <>
            Practical guidance for teams using{" "}
            <span className="text-[var(--n9-accent)]">the full Notes9 research workflow</span>.
          </>
        }
        description="Use this page to understand how the major surfaces work, where each module fits, and how to adopt the platform around real scientific workflows."
        actions={[
          { href: "/platform", label: "Explore the platform" },
          { href: cta, label: "Request a demo", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Guide Map"
            title="Start with the surface that matches your current workflow gap"
            description="These are the most important Notes9 areas to understand when setting up or evaluating a real research workflow."
            align="center"
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {resourceGuides.slice(0, 4).map((guide) => (
              <FeatureCard
                key={guide.id}
                icon={guide.icon}
                title={guide.title}
                description={guide.description}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch">
            <div className="flex h-full flex-col">
              <SectionHeader
                badge="Adoption Path"
                title="How teams should think about rollout"
                description="The best starting point is not everything at once. It is the one workflow where context loss is already expensive."
                className="lg:min-h-[12rem]"
              />
              <div className="mt-8 flex-1 grid gap-4">
                <WorkflowStep step="01" title="Pick one live workflow" description="Choose a project or experiment sequence where the team already loses time reconstructing context." />
                <WorkflowStep step="02" title="Set structure before scale" description="Establish the project, experiment, and note pattern first so the system stays coherent as usage grows." />
                <WorkflowStep step="03" title="Measure retrieval and reporting" description="Judge success by how much easier it becomes to recover prior work and produce clean updates." />
              </div>
            </div>
            <div className="flex h-full flex-col">
              <SectionHeader
                badge="Common Questions"
                title="Themes that usually determine fit"
                description="These are the concerns teams usually raise first when evaluating workflow tooling."
                className="lg:min-h-[12rem]"
              />
              <div className="mt-8 flex-1 grid gap-4">
                {resourceFaqs.map((faq) => (
                  <MinimalCard key={faq.question}>
                    <h3 className="text-[18px] font-semibold text-foreground">{faq.question}</h3>
                    <p className="mt-2 text-[16px] leading-6 text-muted-foreground">{faq.answer}</p>
                  </MinimalCard>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Feature Guides"
            title="Module-by-module guidance"
            description="Each section below distills the older resources content into practical guidance for how that part of the workflow should be used."
          />
          <div className="mt-10 rounded-2xl border border-border/50 bg-background px-6 py-2 shadow-sm backdrop-blur-sm sm:px-8">
            <Accordion type="single" collapsible className="w-full">
              {resourceGuides.map((guide) => (
                <AccordionItem key={guide.id} value={guide.id}>
                  <AccordionTrigger className="py-5 hover:no-underline">
                    <div className="flex min-w-0 items-start gap-4 text-left">
                      <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                        <guide.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[18px] font-semibold text-foreground">{guide.title}</h3>
                        <p className="mt-1 text-[16px] leading-6 text-muted-foreground">{guide.description}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pb-4 pl-0 sm:pl-14">
                      <ul className="space-y-3 text-[16px] leading-6 text-muted-foreground">
                        {guide.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-3">
                            <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--n9-accent)]" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Need help mapping these guides to your own workflow?"
            description="We can walk through the specific part of your research process where documentation, retrieval, or reporting is currently breaking down."
            primary={{ href: cta, label: "Request a demo" }}
            secondary={{ href: "/platform", label: "Review platform" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}
