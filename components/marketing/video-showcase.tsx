"use client"

import { useState } from "react"
import Image from "next/image"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  Database,
  FlaskConical,
  LineChart,
  Network,
  Sparkles,
  TestTube2,
  FileText,
} from "lucide-react"
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
    label: "Samples",
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
    label: "AI Writing",
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
  const [active, setActive] = useState(0)
  const current = slides[active]

  return (
    <section id="explore" className="border-t border-border/40 bg-[var(--n9-accent-light)]/30 dark:bg-muted/10">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Explore Notes9
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            Click any feature to see it in action.
          </p>
        </motion.div>

        <div className="mx-auto mt-10 max-w-6xl">
          {/* Feature tabs */}
          <div className="mb-8 overflow-x-auto scrollbar-none">
            <div className="flex justify-center gap-1.5 min-w-max px-4">
              {slides.map((slide, i) => {
                const Icon = slide.icon
                const isActive = i === active
                return (
                  <button
                    key={slide.id}
                    onClick={() => setActive(i)}
                    className={`relative inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "bg-[var(--n9-accent)] text-white shadow-[0_8px_24px_-8px_var(--n9-accent-glow)]"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{slide.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Screenshot — full width, prominent */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              <div className="relative">
                {/* Subtle glow */}
                <div className="absolute -inset-3 rounded-2xl bg-[var(--n9-accent)]/[0.04] blur-xl" />

                <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background shadow-[0_40px_100px_-30px_rgba(44,36,24,0.18)] dark:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.5)]">
                  {/* Browser bar */}
                  <div className="flex h-9 items-center gap-2 border-b border-border/40 bg-muted/50 px-4">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                      <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                    </div>
                    <div className="ml-3 flex-1 max-w-[220px]">
                      <div className="h-5 rounded-md bg-muted/80 px-3 flex items-center text-[10px] text-muted-foreground/50 font-medium">
                        notes9.com/{current.id}
                      </div>
                    </div>
                  </div>
                  <Image
                    src={resolveDemoScreenshot(current.screenshot, resolvedTheme)}
                    alt={current.alt}
                    width={1920}
                    height={1080}
                    className="block w-full"
                  />
                </div>
              </div>

              {/* Title + description below screenshot */}
              <div className="mt-8 text-center">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--n9-accent)]">
                  <current.icon className="h-3 w-3" />
                  {current.label}
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                  {current.title}
                </h3>
                <p className="mx-auto mt-3 max-w-xl text-lg leading-7 text-muted-foreground">
                  {current.description}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
