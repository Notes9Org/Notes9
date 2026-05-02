"use client"

import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Bot,
  Database,
  FileSearch,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Microscope,
  Settings,
  ShieldCheck,
  TestTube2,
  Users,
  Workflow,
} from "lucide-react"

import { CatalystAISection } from "@/components/marketing/catalyst-ai-section"
import { InsideNotes9Workflow } from "@/components/marketing/inside-notes9-workflow"
import { PricingExperienceLead, pricingStoryFaqs } from "@/components/marketing/pricing-experience"
import {
  CTAPanel,
  FeatureCard,
  MarketingPageFrame,
  PageHero,
  SectionHeader,
  WorkflowStep,
} from "@/components/marketing/site-ui"
import { MinimalCard } from "@/components/marketing/three-d-card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"

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

/** Outcome-led lines only — file formats are implementation detail, not the sell. */
const integrationItems: { name: string; benefit: string }[] = [
  {
    name: "PubMed + Crossref",
    benefit: "Search 35M+ papers without leaving your workspace.",
  },
  {
    name: "DOI-backed references",
    benefit: "Go from discovery to drafting without retyping citations or breaking links.",
  },
  {
    name: "Evidence attached to experiments",
    benefit: "Keep papers, protocols, and lab reports on the experiment — not scattered in inboxes and drives.",
  },
  {
    name: "Handoffs to collaborators",
    benefit: "When someone needs files outside Notes9, export writing and structured project snapshots in one flow.",
  },
]

const aboutTeam = [
  { name: "Research Product", role: "Translates lab friction into product workflows." },
  { name: "Scientific Ops", role: "Shapes continuity models across experiments and reporting." },
  { name: "AI + Engineering", role: "Builds reliable systems that keep context attached." },
]

export function AboutMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="About Notes9"
        layout="centered"
        title={
          <>
            Built for research teams that need{" "}
            <span className="text-[var(--n9-accent)]">continuity, provenance, and clarity</span>.
          </>
        }
        description="Notes9 exists because critical research context still gets lost between papers, notebooks, files, and reporting tools."
        actions={[
          { href: "/platform", label: "Explore product" },
          { href: "/about#contact", label: "Say hello", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40">
        <div className="container mx-auto flex min-h-[calc(100dvh-4rem)] flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Why We Built This"
            title="Research teams should not lose days to documentation overhead."
            description="We kept seeing scientists spend expensive attention on fragmented admin work. Notes9 was built to reduce that burden without compromising rigor."
            align="center"
            className="mx-auto max-w-3xl"
          />
        </div>
      </section>

      <section className="border-t border-border/40 marketing-section-alt">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Mission" title="We take care of the grunt work. You do science." />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard icon={Workflow} title="Operational continuity" description="Keep workflow context connected from literature to reporting." />
            <FeatureCard icon={Database} title="Evidence-linked outputs" description="Preserve provenance so teams can trust and reuse prior work." />
            <FeatureCard icon={ShieldCheck} title="Reliable support layer" description="Use AI and workflow tools that stay inspectable and practical." />
          </div>
        </div>
      </section>

      <section id="team" className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Team" title="People behind Notes9" />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {aboutTeam.map((member) => (
              <MinimalCard key={member.name} className="h-full">
                <h3 className="text-lg font-semibold text-foreground">{member.name}</h3>
                <p className="mt-2 text-sm font-medium text-[var(--n9-accent)]">{member.role}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Building with researchers who need less operational drag and clearer scientific memory.
                </p>
              </MinimalCard>
            ))}
          </div>
        </div>
      </section>

      <section id="careers" className="border-t border-border/40 marketing-section-alt">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Where We’re Headed" title="We are building for deeper workflow continuity." />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard icon={BookOpen} title="Better scientific memory" description="Make prior work easier to retrieve and reuse across projects." />
            <FeatureCard icon={Microscope} title="Stronger execution context" description="Reduce handoff friction in experiment-heavy teams." />
            <FeatureCard icon={Users} title="Closer researcher collaboration" description="Treat users as collaborators in product direction." />
          </div>
        </div>
      </section>

      <section id="contact" className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Say hello"
            description="Whether you have a question, feedback, or just want to talk through your lab's needs, we'd love to hear from you."
            primary={{ href: "mailto:admin@notes9.com", label: "Get in touch" }}
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
        badge="What's inside Notes9"
        layout="centered"
        heroFillViewport
        centeredContentScale={2.4}
        titleClassName="flex min-w-0 w-full justify-center overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        title={<>The smart platform for full research workflow.</>}
        description="Notes9 is an end-to-end research workspace with a personal AI lab assistant that helps teams move from hypothesis to execution to decisions faster."
        actions={[
          { href: "/auth/login", label: "Try for free" },
          { href: "/#contact", label: "Request a demo", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <InsideNotes9Workflow />
        </div>
      </section>

      <section className="border-t border-border/40 marketing-section-alt">
        <div className="container mx-auto px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <div className="marketing-glass-surface mx-auto max-w-[84rem] rounded-2xl border border-border/60 bg-background/60 px-6 py-6 shadow-sm sm:px-10 sm:py-8 dark:bg-background/40">
            <p className="border-l-2 border-[var(--n9-accent)] pl-4 text-xl font-medium leading-snug text-foreground sm:text-2xl sm:leading-snug lg:text-3xl lg:leading-tight">
              Most AI tools know nothing about your project.
            </p>
            <p className="mt-4 pl-4 text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base sm:leading-relaxed">
            Every paper you read, every protocol you write, every result you capture - Our Inhouse AI lab assistant is
            connected to all of it. 
            </p>
          </div>
        </div>
      </section>

      <CatalystAISection />

      <section id="integrations" className="border-t border-border/40 marketing-section-alt">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Integrations"
            title="Notes9 works around your existing stack, not instead of it"
            description="Meet your lab where the evidence already lives — literature, citations, attachments, and reviewer handoffs — without ripping out tools that already work."
            align="center"
          />
          <div className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2">
            {integrationItems.map((item) => (
              <div
                key={item.name}
                className="marketing-glass-surface rounded-xl border border-border/60 bg-background/55 px-4 py-3 text-left shadow-sm sm:px-5 sm:py-4"
              >
                <p className="text-sm font-semibold text-foreground">{item.name}</p>
                <p className="mt-2 text-sm leading-snug text-muted-foreground">{item.benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-border/40 marketing-section-accent">
        <div className="relative z-10 container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="marketing-glass-surface mx-auto max-w-[96rem] rounded-2xl border border-border/60 bg-background/70 px-8 py-10 text-center shadow-sm backdrop-blur-sm sm:px-12 sm:py-12 dark:border-white/10 dark:bg-background/45">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--n9-accent)]">
              Ready to start for free?
            </p>
            <h2 className="font-serif text-2xl font-medium leading-snug tracking-tight text-foreground sm:text-[1.65rem] md:text-3xl">
              One conversation is all it takes.
            </h2>
            <p className="mx-auto mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base">
              Tell us how your team works today. We&apos;ll show you exactly how Notes9 fits in.
            </p>
            <div className="mt-8 flex justify-center">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-[var(--n9-accent)] px-8 text-base font-medium text-primary-foreground shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
              >
                <Link href="/#contact">
                  Request a demo
                  <ArrowRight className="ml-2 inline h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  )
}

export function PricingMarketingPage() {
  return (
    <MarketingPageFrame>
      <PricingExperienceLead />

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Common questions" title="Before you reach out" align="center" />
          <Accordion type="single" collapsible className="marketing-glass-surface mx-auto mt-10 max-w-3xl rounded-xl border border-border/60 bg-background/50 px-3 sm:px-5">
            {pricingStoryFaqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`pricing-faq-${index}`} className="border-border/55 px-1">
                <AccordionTrigger iconVariant="plus" className="py-4 hover:no-underline">
                  <span className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 pt-0 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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

      <section className="border-t border-border/40 marketing-section-alt">
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

      <section className="border-t border-border/40 marketing-section-alt">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Feature Guides"
            title="Module-by-module guidance"
            description="Each section below distills the older resources content into practical guidance for how that part of the workflow should be used."
          />
          <div className="marketing-glass-surface mt-10 rounded-2xl border border-border/50 bg-background/55 px-6 py-2 shadow-sm sm:px-8">
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
                    <div className="pb-4 pl-0 sm:pl-14">
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

      <section className="border-t border-border/40 marketing-section-alt">
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
