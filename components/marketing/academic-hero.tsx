"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Layers, AlertTriangle } from "lucide-react"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel"
import { WorkflowDemoStrip } from "@/components/marketing/workflow-demo-strip"

const narrativeSlides = [
  {
    id: "problem",
    badge: "The problem",
    title: "Every lab faces the same friction.",
    subtitle: "Context gets lost between papers, notebooks, files, and tools. The cost is real.",
    stats: [
      {
        value: "42%",
        label: "of faculty time on federally funded research goes to administrative burden rather than science.",
        source: "FDP Faculty Burden Survey",
      },
      {
        value: "~5 hrs",
        label: "per week researchers spend searching for or re-documenting context that should already be accessible.",
        source: "Nature & Elsevier workflow studies",
      },
      {
        value: "70%+",
        label: "of researchers surveyed by Nature tried and failed to reproduce another scientist's experiments.",
        source: "Nature reproducibility survey",
      },
    ],
    icon: AlertTriangle,
    bgClass: "from-amber-50/90 via-background to-background dark:from-amber-950/20 dark:via-background dark:to-background",
    steps: [
      { image: "/demo/literature-search.png", label: "Searching for context..." },
      { image: "/demo/literature-list.png", label: "Scattered across tools" },
    ],
    fallbackSteps: [
      { image: "/literature-search-page.png", label: "Searching for context..." },
      { image: "/literature-review-search.png", label: "Scattered across tools" },
    ],
  },
  {
    id: "solution",
    badge: "The solution",
    videoSrc: "/demo/workflow.webm",
    title: "One connected layer for the full research workflow.",
    subtitle: "Notes9 keeps literature, experiments, lab memory, and reporting in one place—so context stays attached to the work.",
    points: [
      "Literature, experiments, and decisions stay linked",
      "Lab memory grows with you—retrieval gets easier as projects evolve",
      "Move from active work into summaries and handoffs without reconstructing the evidence trail",
    ],
    icon: Layers,
    bgClass: "from-[var(--n9-accent-light)] via-background to-background dark:from-[var(--n9-accent-light)] dark:via-background dark:to-background",
    steps: [
      { image: "/demo/projects.png", label: "One layer" },
      { image: "/demo/literature-search.png", label: "Search" },
      { image: "/demo/experiment-details.png", label: "Capture" },
      { image: "/demo/lab-memory.png", label: "Connect" },
    ],
    fallbackSteps: [
      { image: "/projects-page.png", label: "One layer" },
      { image: "/literature-search-page.png", label: "Search" },
      { image: "/experiment-details.png", label: "Capture" },
      { image: "/lab_notes-details.png", label: "Connect" },
    ],
  },
  {
    id: "differentiation",
    badge: "The difference",
    title: "Not more fragmented tools. A different operating model.",
    subtitle: "Context stays attached, provenance is built in, and the workflow is designed for how labs actually work.",
    points: [
      "Knowledge flow: Context stays connected, not drifting across PDFs and spreadsheets",
      "Retrieval: Structured capture instead of memory and manual search",
      "Reporting: Linked records make summaries easier to assemble",
    ],
    icon: CheckCircle2,
    bgClass: "from-background via-muted/40 to-background dark:from-background dark:via-muted/30 dark:to-background",
    steps: [
      { image: "/demo/project-report.png", label: "Report with evidence" },
      { image: "/demo/lab-memory.png", label: "Context stays linked" },
    ],
    fallbackSteps: [
      { image: "/project-details.png", label: "Report with evidence" },
      { image: "/lab_notes-details.png", label: "Context stays linked" },
    ],
  },
]

export function AcademicHero() {
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)

  const onSelect = useCallback((api: CarouselApi) => {
    if (!api) return
    setCurrent(api.selectedScrollSnap())
  }, [])

  useEffect(() => {
    if (!api) return
    onSelect(api)
    api.on("select", onSelect)
    return () => api.off("select", onSelect)
  }, [api, onSelect])

  useEffect(() => {
    if (!api) return
    const interval = setInterval(() => api.scrollNext(), 7000)
    return () => clearInterval(interval)
  }, [api])

  return (
    <section className="relative overflow-hidden">
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: true }}
        className="w-full"
      >
        <CarouselContent className="ml-0">
          {narrativeSlides.map((slide) => (
              <CarouselItem key={slide.id} className="pl-0">
                <div
                  className={`relative flex min-h-[90vh] w-full flex-col bg-gradient-to-b ${slide.bgClass} pt-16 pb-24 sm:pt-24 sm:pb-32`}
                >
                  <div className="absolute inset-0 overflow-hidden">
                    <WorkflowDemoStrip
                      videoSrc={"videoSrc" in slide ? slide.videoSrc : undefined}
                      steps={slide.steps}
                      fallbackSteps={slide.fallbackSteps}
                      intervalMs={4500}
                      fullBleed
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/60 to-background" />
                  </div>

                  <div className="container relative z-10 mx-auto flex flex-1 flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
                      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">
                        <slide.icon className="h-3.5 w-3.5" />
                        {slide.badge}
                      </div>
                      <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.1]">
                        {slide.title}
                      </h1>
                      <p className="mx-auto mt-6 max-w-2xl text-2xl leading-9 text-muted-foreground">
                        {slide.subtitle}
                      </p>

                      {slide.stats && (
                        <div className="mx-auto mt-14 grid max-w-3xl gap-8 sm:grid-cols-3">
                          {slide.stats.map((stat) => (
                            <div key={stat.value} className="text-center">
                              <div className="text-3xl font-bold tracking-tight text-[var(--n9-accent)] sm:text-4xl">
                                {stat.value}
                              </div>
                              <p className="mt-2 text-lg leading-8 text-muted-foreground">
                                {stat.label}
                              </p>
                              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted-foreground/70">
                                {stat.source}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {slide.points && (
                        <ul className="mx-auto mt-12 max-w-xl space-y-4 text-left">
                          {slide.points.map((point, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--n9-accent)]" />
                              <span className="text-xl leading-8 text-muted-foreground">
                                {point}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-12 flex justify-center items-center gap-2">
                        {narrativeSlides.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => api?.scrollTo(i)}
                            className={`h-2 rounded-full transition-all ${
                              i === current
                                ? "w-8 bg-[var(--n9-accent)]"
                                : "w-2 bg-border hover:bg-muted-foreground/40"
                            }`}
                            aria-label={`Go to slide ${i + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  )
}
