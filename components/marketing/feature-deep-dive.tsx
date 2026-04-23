"use client"

import { useRef } from "react"
import Image from "next/image"
import { useTheme } from "next-themes"
import { motion, useScroll, useTransform, useMotionValue, useSpring, useMotionTemplate } from "framer-motion"
import { BookOpen, ClipboardList, PenLine } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { resolveDemoScreenshot } from "@/components/marketing/demo-asset"

interface Feature {
  id: string
  icon: LucideIcon
  phase: string
  title: string
  description: string
  screenshot: string
  alt: string
}

const features: Feature[] = [
  {
    id: "literature-planning",
    icon: BookOpen,
    phase: "Before bench",
    title: "Literature & planning",
    description:
      "Before the bench, search literature, read and organize knowledge, draft protocols, and plan experiments without losing context.",
    screenshot: "/demo/literature-list.png",
    alt: "Notes9 literature and planning workspace",
  },
  {
    id: "experiment-notes",
    icon: ClipboardList,
    phase: "During bench",
    title: "Experiment work & notes",
    description:
      "During execution, track lab work, observations, tasks, and lab notes while preserving experiment context.",
    screenshot: "/demo/new-lab-note.png",
    alt: "Notes9 lab notes and experiment workspace",
  },
  {
    id: "results-writing",
    icon: PenLine,
    phase: "After bench",
    title: "Results & writing",
    description:
      "Turn connected project knowledge into summaries, reports, and scientific writing without starting from a blank page.",
    screenshot: "/demo/writing.png",
    alt: "Notes9 writing and reporting from project context",
  },
]

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const { resolvedTheme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })

  const y = useTransform(scrollYProgress, [0, 1], [40, -40])
  const imgOpacity = useTransform(scrollYProgress, [0, 0.25, 0.75, 1], [0, 1, 1, 0.6])
  const isReversed = index % 2 === 1

  // 3D Tilt & Interactivity State
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const xPct = useMotionValue(0.5)
  const yPct = useMotionValue(0.5)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    xPct.set((e.clientX - rect.left) / rect.width)
    yPct.set((e.clientY - rect.top) / rect.height)
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const handleMouseLeave = () => {
    xPct.set(0.5)
    yPct.set(0.5)
  }

  const springConfig = { damping: 20, stiffness: 150, mass: 0.5 }
  const rotateX = useSpring(useTransform(yPct, [0, 1], [6, -6]), springConfig)
  const rotateY = useSpring(useTransform(xPct, [0, 1], [-6, 6]), springConfig)

  const spotlightX = useSpring(mouseX, springConfig)
  const spotlightY = useSpring(mouseY, springConfig)
  const spotlightBackground = useMotionTemplate`radial-gradient(circle 400px at ${spotlightX}px ${spotlightY}px, var(--n9-accent-glow), transparent 40%)`

  return (
    <div ref={ref} className="relative grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      {/* Text */}
      <motion.div
        initial={{ opacity: 0, x: isReversed ? 30 : -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        viewport={{ once: true }}
        className={`space-y-4 ${isReversed ? "lg:order-2" : ""}`}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          viewport={{ once: true }}
          className="inline-flex max-w-full flex-wrap items-center gap-[0.5rem] rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-[0.9rem] py-[0.3rem] text-[0.76rem] font-semibold uppercase leading-snug tracking-[0.12em] text-[var(--n9-accent)]"
        >
          <feature.icon className="size-[0.82rem] shrink-0" />
          {feature.phase}
        </motion.div>
        <h3 className="font-serif text-[2.1rem] leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
          {feature.title}
        </h3>
        <p className="text-[1.35rem] leading-[2.4rem] text-muted-foreground">
          {feature.description}
        </p>
      </motion.div>

      {/* Screenshot Container with Parallax + Tilt + Spotlight */}
      <motion.div
        style={{ y, opacity: imgOpacity, perspective: 1200 }}
        className={`relative z-10 w-full ${isReversed ? "lg:order-1" : ""}`}
      >
        <motion.div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ rotateX, rotateY }}
          className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background shadow-[0_32px_80px_-30px_rgba(44,36,24,0.15)] transition-shadow duration-500 hover:shadow-[0_32px_80px_-20px_rgba(155,71,34,0.18)] dark:shadow-[0_32px_80px_-30px_rgba(0,0,0,0.5)] transform-gpu"
        >
          {/* Spotlight Glow Effect inside the card border boundaries */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-[1] mix-blend-plus-lighter opacity-0 transition-opacity duration-300 group-hover:opacity-[0.15] dark:group-hover:opacity-[0.25]"
            style={{ background: spotlightBackground }}
          />

          {/* Browser bar */}
          <div className="relative z-10 flex h-8 items-center gap-2 border-b border-border/40 bg-muted/50 px-3">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            </div>
          </div>
          
          <div className="relative z-10">
            <Image
              src={resolveDemoScreenshot(feature.screenshot, resolvedTheme)}
              alt={feature.alt}
              width={1200}
              height={800}
              className="block w-full"
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

export function FeatureDeepDive() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  })
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <section id="features" ref={sectionRef} className="relative bg-[var(--n9-accent-light)]/50 dark:bg-muted/10">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-16"
        >
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            From literature review to lab work to reporting, <span className="text-[var(--n9-accent)]">Notes9</span> keeps every step connected - and every insight preserved.
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            A connected workflow for the full research journey.
          </p>
        </motion.div>

        <div className="relative mx-auto max-w-6xl">
          {/* Scroll progress line (desktop only) */}
          <div className="absolute left-1/2 top-0 bottom-0 hidden w-[2px] -translate-x-1/2 bg-border/30 lg:block" aria-hidden="true">
            <motion.div
              style={{ height: lineHeight }}
              className="w-full rounded-full bg-[var(--n9-accent)]/45"
            />
          </div>

          {/* Feature node dots on the timeline */}
          <div className="absolute left-1/2 top-0 bottom-0 hidden -translate-x-1/2 lg:block" aria-hidden="true">
            {features.map((_, i) => {
              const n = features.length
              const topPct = n <= 1 ? 0 : (i / (n - 1)) * 100
              return (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  viewport={{ once: true }}
                  className="absolute left-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-[var(--n9-accent)]/60 bg-background"
                  style={{ top: `${topPct}%` }}
                />
              )
            })}
          </div>

          <div className="space-y-16 lg:space-y-24">
            {features.map((feature, i) => (
              <FeatureRow key={feature.id} feature={feature} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
