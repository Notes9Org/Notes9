"use client"

import {
  BookOpen,
  Bot,
  Database,
  FileSearch,
  FileText,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Microscope,
  Settings,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Users,
  Workflow,
} from "lucide-react"

import {
  ComparisonRow,
  CTAPanel,
  FeatureCard,
  LinkCard,
  MarketingPageFrame,
  PageHero,
  SectionHeader,
  WorkflowStep,
} from "@/components/marketing/site-ui"
import { MinimalCard } from "@/components/marketing/three-d-card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

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
          <SectionHeader badge="Why we exist" title="Modern research teams do not need more fragmented software." />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard icon={Workflow} title="Fragmented context" description="Important decisions disappear between PDFs, spreadsheets, instruments, and disconnected notes." />
            <FeatureCard icon={Workflow} title="Structured continuity" description="Notes9 links evidence, experiment work, and reporting so teams move without losing the trail." />
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">Mission</p>
              <p className="mt-4 text-lg leading-8 text-foreground">Make rigorous scientific work easier to run, trace, and reuse across the full research cycle.</p>
            </MinimalCard>
            <MinimalCard className="h-full">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">Vision</p>
              <p className="mt-4 text-lg leading-8 text-foreground">Give every research team a trusted operating layer for decisions, documentation, and discovery.</p>
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
            One workflow layer for{" "}
            <span className="text-[var(--n9-accent)]">literature, lab work, memory, and reporting</span>.
          </>
        }
        description="Notes9 helps research teams capture work in a structured way, retrieve context quickly, and move from fragmented notes to decision-ready outputs."
        actions={[
          { href: cta, label: "Request a demo" },
          { href: "/resources", label: "Review resources", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Capabilities" title="Designed around the full research workflow" align="center" />
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <FeatureCard icon={FileSearch} title="Literature intelligence" description="Find, stage, and synthesize relevant papers without losing the link back to the source material." />
            <FeatureCard icon={FolderKanban} title="Project structure" description="Organize projects, experiments, supporting materials, and team context inside a single operating model." />
            <FeatureCard icon={FlaskConical} title="Smart notebook capture" description="Record work in a structured notebook that stays useful for future retrieval and reporting." />
            <FeatureCard icon={Database} title="Provenance-aware memory" description="Preserve why decisions were made, what evidence was used, and how records connect." />
            <FeatureCard icon={LineChart} title="Analysis and reporting" description="Turn structured context into summaries, status updates, and decision-ready outputs faster." />
            <FeatureCard icon={Bot} title="Workflow-aware AI" description="Use assistance grounded in project context rather than detached from the rest of the work." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch">
            <div className="flex h-full flex-col">
              <SectionHeader
                badge="Differentiation"
                title="From passive records to an active research system"
                className="lg:min-h-[7.5rem]"
              />
              <div className="mt-8 flex-1 space-y-4">
                <ComparisonRow label="Knowledge flow" legacy="Notes, files, and references drift apart as projects move." notes9="Context stays connected to the workflow that produced it." />
                <ComparisonRow label="Retrieval" legacy="Teams rely on memory, manual search, and ad hoc naming." notes9="Structured capture makes retrieval faster and more reliable." />
                <ComparisonRow label="Reporting" legacy="Updates require reconstructing what happened from multiple systems." notes9="Linked records make summaries easier to assemble." />
              </div>
            </div>
            <div className="flex h-full flex-col">
              <SectionHeader
                badge="Workflow"
                title="A more continuous operating model"
                className="lg:min-h-[7.5rem]"
              />
              <div className="mt-8 flex-1 grid gap-4">
                <WorkflowStep step="01" title="Frame the evidence" description="Collect literature, identify signals, and connect them to project context." />
                <WorkflowStep step="02" title="Execute with structure" description="Capture experiment intent, protocol context, and observations in one place." />
                <WorkflowStep step="03" title="Preserve provenance" description="Keep decisions and linked outputs visible so work remains reusable." />
                <WorkflowStep step="04" title="Report faster" description="Use structured context for cleaner updates and analysis handoffs." />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="See the platform through your own workflow."
            description="We can map Notes9 against your current process to show where value is most immediate."
            primary={{ href: cta, label: "Request a demo" }}
            secondary={{ href: "/pricing", label: "See engagement options" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

export function PricingMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Pricing"
        title={
          <>
            Engagements structured around{" "}
            <span className="text-[var(--n9-accent)]">lab scope and workflow depth</span>.
          </>
        }
        description="Notes9 pricing is scoped around workflow complexity, team size, and enablement needs."
        actions={[
          { href: cta, label: "Discuss fit and pricing" },
          { href: "/platform", label: "Review platform", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Engagement models" title="A clearer path from evaluation to team rollout" align="center" />
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              { title: "Pilot engagement", icon: FlaskConical, points: ["Focused evaluation for a single team", "Hands-on workflow mapping", "Best for labs validating fit"] },
              { title: "Team deployment", icon: Users, points: ["Shared operating model across collaborators", "Repeatable documentation and retrieval", "Best for labs needing operational consistency"] },
              { title: "Research operations", icon: ShieldCheck, points: ["Broader workflow design and governance", "Suitable for complex research operations", "Best for multi-project environments"] },
            ].map((item) => (
              <MinimalCard key={item.title}>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
                  {item.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--n9-accent)]" />
                      {p}
                    </li>
                  ))}
                </ul>
              </MinimalCard>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Buyer clarity" title="What buyers can expect" align="center" />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard icon={Workflow} title="Workflow-led scoping" description="Pricing conversations begin with the workflows you want to improve." />
            <FeatureCard icon={GraduationCap} title="Enablement included" description="Implementation and education are part of the discussion." />
            <FeatureCard icon={ShieldCheck} title="Clear expectations" description="We align on support and rollout approach early." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Get a pricing conversation grounded in your workflow."
            description="Share your team shape and workflow goals, and we will scope a practical engagement path."
            primary={{ href: cta, label: "Discuss fit and pricing" }}
            secondary={{ href: "/resources", label: "Review enablement surfaces" }}
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
                    <h3 className="text-base font-semibold text-foreground">{faq.question}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
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
          <div className="mt-10 rounded-2xl border border-border/50 bg-background/80 px-6 py-2 shadow-sm backdrop-blur-sm sm:px-8">
            <Accordion type="single" collapsible className="w-full">
              {resourceGuides.map((guide) => (
                <AccordionItem key={guide.id} value={guide.id}>
                  <AccordionTrigger className="py-5 hover:no-underline">
                    <div className="flex min-w-0 items-start gap-4 text-left">
                      <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                        <guide.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground">{guide.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{guide.description}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pb-4 pl-14">
                      <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
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
