"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { useTheme } from "next-themes"
import { BookOpen, Database, FlaskConical, LineChart, Network, Sparkles, TestTube2, FileText } from "lucide-react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"
import { ProductFrame } from "@/components/marketing/three-d-card"
import { resolveDemoScreenshot } from "@/components/marketing/demo-asset"

const slides = [
  {
    id: "literature",
    label: "Literature",
    icon: BookOpen,
    title: "Find, rank, and save the right papers",
    description:
      "Semantic search across sources with ranked relevance. Every result stays tied to the project context it informs.",
    screenshot: "/demo/literature-search.png",
    alt: "Notes9 literature search",
  },
  {
    id: "research-map",
    label: "Research Map",
    icon: Network,
    title: "Visualize your entire knowledge graph",
    description:
      "Explore connections between projects, papers, experiments, and notes dynamically.",
    screenshot: "/demo/research-map-literature.png",
    alt: "Notes9 research map",
  },
  {
    id: "experiments",
    label: "Experiments",
    icon: FlaskConical,
    title: "Capture experiments in structured, reusable formats",
    description:
      "Record protocols, observations, and results in a notebook that still makes sense when your team revisits the work later.",
    screenshot: "/demo/experiment-details.png",
    alt: "Notes9 experiment capture",
  },
  {
    id: "memory",
    label: "Lab Memory",
    icon: Database,
    title: "Connected records with provenance",
    description:
      "Decisions, sources, and outputs stay linked. Recover important context without relying on personal memory or guesswork.",
    screenshot: "/demo/lab-memory.png",
    alt: "Notes9 lab memory",
  },
  {
    id: "samples",
    label: "Sample Inventory",
    icon: TestTube2,
    title: "Track physical materials securely",
    description:
      "Manage your lab inventory seamlessly, linking samples directly to their corresponding origin and experiment.",
    screenshot: "/demo/samples.png",
    alt: "Notes9 sample inventory",
  },
  {
    id: "protocols",
    label: "Protocols",
    icon: FileText,
    title: "Standardize your lab procedures",
    description:
      "Maintain, version, and share procedural details and SOPs to ensure your experiments are highly reproducible.",
    screenshot: "/demo/protocol-details.png",
    alt: "Notes9 protocol details",
  },
  {
    id: "reporting",
    label: "Reporting",
    icon: LineChart,
    title: "Move faster into summaries and updates",
    description:
      "Use structured workflow context to accelerate reports, reviews, and downstream analysis.",
    screenshot: "/demo/project-report.png",
    alt: "Notes9 project reporting",
  },
  {
    id: "writing",
    label: "Writing & AI",
    icon: Sparkles,
    title: "Draft publications with AI assistance",
    description:
      "Write manuscripts equipped with full context and a dedicated AI assistant directly inside the editor.",
    screenshot: "/demo/writing-editor.png",
    alt: "Notes9 writing editor with AI",
  },
]

export function ProductShowcase() {
  const { resolvedTheme } = useTheme()
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
    return () => {
      api.off("select", onSelect)
    }
  }, [api, onSelect])

  useEffect(() => {
    if (!api) return
    const interval = setInterval(() => api.scrollNext(), 6000)
    return () => clearInterval(interval)
  }, [api])

  return (
    <section id="explore" className="bg-[var(--n9-accent-light)] dark:bg-muted/20">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Explore Notes9
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            One connected layer for the full research workflow.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-5xl">
          <Carousel
            setApi={setApi}
            opts={{ align: "start", loop: true }}
            className="w-full"
          >
            <CarouselContent>
              {slides.map((slide) => (
                <CarouselItem key={slide.id}>
                  <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
                    <div className="order-2 flex h-full flex-col justify-start text-center lg:order-1 lg:text-left">
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">
                        <slide.icon className="h-3.5 w-3.5" />
                        {slide.label}
                      </div>
                      <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                        {slide.title}
                      </h3>
                      <p className="mt-4 text-lg leading-7 text-muted-foreground">
                        {slide.description}
                      </p>
                    </div>
                    <div className="order-1 flex h-full items-start lg:order-2">
                      <ProductFrame>
                        <Image
                          src={resolveDemoScreenshot(slide.screenshot, resolvedTheme)}
                          alt={slide.alt}
                          width={1200}
                          height={800}
                          className="block w-full"
                        />
                      </ProductFrame>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="-left-4 border-border bg-background/95 hover:bg-muted sm:-left-6 md:-left-10" />
            <CarouselNext className="-right-4 border-border bg-background/95 hover:bg-muted sm:-right-6 md:-right-10" />
          </Carousel>

          <div className="mt-8 flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => api?.scrollTo(i)}
                className={`h-2 rounded-full transition-all ${
                  i === current
                    ? "w-6 bg-[var(--n9-accent)]"
                    : "w-2 bg-border hover:bg-muted-foreground/40"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
