"use client"

import Image from "next/image"
import { useTheme } from "next-themes"
import { motion } from "framer-motion"
import {
  BookOpen,
  FlaskConical,
  Network,
  Database,
  FileText,
  Sparkles,
  TestTube2,
  LineChart,
} from "lucide-react"
import { resolveDemoScreenshot } from "@/components/marketing/demo-asset"

const features = [
  {
    id: "literature",
    icon: BookOpen,
    label: "Literature Search",
    description: "Find, rank, and save the right papers with semantic search tied to project context.",
    screenshot: "/demo/literature-search.png",
    alt: "Notes9 literature search interface",
    span: "md:col-span-2",
    aspect: "aspect-[16/9]",
  },
  {
    id: "research-map",
    icon: Network,
    label: "Research Map",
    description: "Visualize connections between projects, papers, experiments, and notes.",
    screenshot: "/demo/research-map-literature.png",
    alt: "Notes9 research map knowledge graph",
    span: "md:col-span-1",
    aspect: "aspect-[4/3]",
  },
  {
    id: "experiments",
    icon: FlaskConical,
    label: "Experiments",
    description: "Capture experiments in structured, reusable formats your team can revisit.",
    screenshot: "/demo/experiment-details.png",
    alt: "Notes9 experiment capture",
    span: "md:col-span-1",
    aspect: "aspect-[4/3]",
  },
  {
    id: "writing",
    icon: Sparkles,
    label: "AI Writing",
    description: "Draft manuscripts with full context and a dedicated AI assistant in the editor.",
    screenshot: "/demo/writing-editor.png",
    alt: "Notes9 writing editor with AI",
    span: "md:col-span-2",
    aspect: "aspect-[16/9]",
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export function FeatureBento() {
  const { resolvedTheme } = useTheme()

  return (
    <section className="border-t border-border/40">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Everything your lab needs, connected
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            From literature discovery to final reports, every step stays linked.
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3"
        >
          {features.map((f) => (
            <motion.div
              key={f.id}
              variants={itemVariants}
              className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm transition-shadow duration-300 hover:shadow-lg dark:bg-card/60 cursor-pointer ${f.span}`}
            >
              {/* Screenshot */}
              <div className={`relative ${f.aspect} overflow-hidden`}>
                <Image
                  src={resolveDemoScreenshot(f.screenshot, resolvedTheme)}
                  alt={f.alt}
                  fill
                  className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
              </div>

              {/* Text overlay */}
              <div className="relative -mt-16 px-5 pb-5 z-10">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--n9-accent)]">
                  <f.icon className="h-3 w-3" />
                  {f.label}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {f.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
