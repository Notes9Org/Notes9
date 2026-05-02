"use client"

import { useState } from "react"
import Image from "next/image"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  Database,
  FolderKanban,
  LayoutDashboard,
  Network,
  TestTube2,
} from "lucide-react"
import { resolveDemoScreenshot } from "@/components/marketing/demo-asset"
import { PretextReveal } from "@/components/ui/fluid-text"

/**
 * Feature screenshots intentionally avoid overlap with the hero carousel
 * (literature / experiment / lab memory / protocol detail / writing / project report).
 */
const slides = [
  {
    id: "research-map",
    label: "Research map",
    icon: Network,
    title: "See how ideas connect",
    description:
      "Navigate projects, papers, and notes as a graph so context stays visible instead of buried in folders.",
    screenshot: "/demo/research-map-literature.png",
    alt: "Notes9 research map",
  },
  {
    id: "dashboard",
    label: "Lab overview",
    icon: LayoutDashboard,
    title: "One dashboard for lab signal",
    description:
      "Surface what needs attention across projects and experiments without jumping between tools.",
    screenshot: "/demo/dashboard.png",
    alt: "Notes9 dashboard",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    title: "Structure work without rigidity",
    description:
      "Keep initiatives, milestones, and ownership clear so handoffs do not erase nuance.",
    screenshot: "/demo/projects.png",
    alt: "Notes9 projects",
  },
  {
    id: "protocols",
    label: "Protocol library",
    icon: TestTube2,
    title: "Reusable protocols, living SOPs",
    description:
      "Centralize SOPs where they are actually used — tied to experiments instead of a static PDF shelf.",
    screenshot: "/demo/protocols.png",
    alt: "Notes9 protocol library",
  },
  {
    id: "samples",
    label: "Samples & inventory",
    icon: Database,
    title: "Traceability by default",
    description:
      "Link samples to experiments and reports so provenance holds up under audit or replication.",
    screenshot: "/demo/samples.png",
    alt: "Notes9 samples",
  },
  {
    id: "literature-pipeline",
    label: "Literature pipeline",
    icon: BookOpen,
    title: "From PDFs to project memory",
    description:
      "Track reviews and citations in one pipeline so literature work feeds the lab, not a separate silo.",
    screenshot: "/demo/literature-list.png",
    alt: "Notes9 literature reviews list",
  },
]

export function ProductShowcase() {
  const { resolvedTheme } = useTheme()
  const [active, setActive] = useState(0)
  const current = slides[active]

  return (
    <section id="explore" className="relative py-24 sm:py-32 bg-transparent">
      {/* Subtle document grid — doc-parsing / “precision” cue without extra screenshots */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
        style={{
          backgroundImage: `linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mb-12 max-w-3xl"
        >
          <h2 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
            <PretextReveal text="Free your data from static notebooks." />
          </h2>
          <p className="mt-6 text-xl leading-8 text-muted-foreground italic">
            <PretextReveal
              text="Flexible modules for literature, execution, and reporting — in one connected workspace."
              delay={0.15}
            />
          </p>
        </motion.div>

        {/* Reducto-style horizontal capability pills */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10 flex flex-wrap gap-2"
        >
          {slides.map((slide, i) => {
            const on = i === active
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
                  on
                    ? "border-[var(--n9-accent)]/50 bg-[var(--n9-accent-light)] text-[var(--n9-accent)] shadow-sm"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-[var(--n9-accent)]/30 hover:text-foreground"
                }`}
              >
                {slide.label}
              </button>
            )
          })}
        </motion.div>

        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left: Vertical tabs */}
          <div className="relative flex flex-col space-y-2 lg:col-span-5">
            <div className="absolute bottom-4 left-[20px] top-4 -z-10 hidden w-px bg-border/40 sm:block" />

            {slides.map((slide, i) => {
              const Icon = slide.icon
              const isActive = i === active
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left transition-all duration-300 cursor-pointer ${
                    isActive
                      ? "border-border/50 bg-muted/50 shadow-sm"
                      : "border-transparent hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-4 px-6 py-5">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                        isActive
                          ? "bg-[var(--n9-accent)] text-primary-foreground shadow-md shadow-[var(--n9-accent-glow)]/50"
                          : "bg-muted text-muted-foreground group-hover:border group-hover:bg-background group-hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={`text-xl font-semibold tracking-tight transition-colors ${
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {slide.label}
                    </span>
                  </div>

                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="px-6 pb-6 pt-0"
                      >
                        <div className="pl-0 sm:pl-14">
                          <div className="text-base leading-relaxed text-muted-foreground">
                            <strong className="mb-1 block font-medium text-foreground">
                              <PretextReveal text={slide.title} stagger={0.01} />
                            </strong>
                            <p>{slide.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              )
            })}
          </div>

          {/* Right: Single preview — unique assets vs hero */}
          <div className="relative lg:sticky lg:top-32 lg:col-span-7">
            <div className="absolute -inset-4 rounded-3xl bg-[var(--n9-accent)]/[0.04] blur-2xl" />

            <div className="marketing-glass-surface group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-background/45 p-2 shadow-2xl shadow-black/5 ring-1 ring-black/5 dark:ring-white/10 sm:p-6">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.02, filter: "blur(6px)" }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="relative h-full w-full overflow-hidden rounded-xl border border-border/50 shadow-inner"
                >
                  <Image
                    src={resolveDemoScreenshot(current.screenshot, resolvedTheme)}
                    alt={current.alt}
                    fill
                    className="object-cover object-left-top"
                    sizes="(max-width: 1024px) 100vw, 58vw"
                    priority={active === 0}
                  />

                  <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-transparent via-[var(--n9-accent)]/[0.04] to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
