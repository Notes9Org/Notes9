"use client"

import { useRef } from "react"
import Image from "next/image"
import { useTheme } from "next-themes"
import { motion, useScroll, useTransform, useMotionValue, useSpring, useMotionTemplate } from "framer-motion"
import {
  Bot,
  Database,
  FileSearch,
  TestTube2,
  LineChart,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { resolveDemoScreenshot } from "@/components/marketing/demo-asset"

interface Feature {
  id: string
  icon: LucideIcon
  label: string
  title: string
  description: string
  screenshot: string
  alt: string
}

const features: Feature[] = [
  {
    id: "memory",
    icon: Database,
    label: "Lab Memory",
    title: "Connected records with provenance",
    description:
      "Decisions, sources, and outputs stay linked. Recover important context without relying on personal memory or guesswork.",
    screenshot: "/demo/lab-memory.png",
    alt: "Notes9 lab memory showing connected records",
  },
  {
    id: "literature",
    icon: FileSearch,
    label: "Literature",
    title: "Bring papers into the active workflow",
    description:
      "Search, review, and connect source material directly to experiments, notes, and downstream writing.",
    screenshot: "/demo/literature-list.png",
    alt: "Notes9 literature reviews",
  },
  {
    id: "samples",
    icon: TestTube2,
    label: "Sample Inventory",
    title: "Track physical materials securely",
    description:
      "Manage your lab inventory seamlessly, linking samples directly to their corresponding origin and experiment.",
    screenshot: "/demo/samples.png",
    alt: "Notes9 sample inventory",
  },
  {
    id: "reporting",
    icon: LineChart,
    label: "Reporting",
    title: "Move faster into summaries and updates",
    description:
      "Use structured workflow context to accelerate reports, reviews, and downstream analysis.",
    screenshot: "/demo/project-report.png",
    alt: "Notes9 project reporting",
  },
  {
    id: "writing",
    icon: Bot,
    label: "Write With AI",
    title: "Draft from real research context",
    description:
      "Move from literature, notes, and linked records into structured writing with AI grounded in the actual workflow.",
    screenshot: "/demo/writing.png",
    alt: "Notes9 writing with AI",
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
          className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--n9-accent)]"
        >
          <feature.icon className="h-3 w-3" />
          {feature.label}
        </motion.div>
        <h3 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {feature.title}
        </h3>
        <p className="text-lg leading-8 text-muted-foreground">
          {feature.description}
        </p>
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: 80 }}
          transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
          viewport={{ once: true }}
          className="h-[2px] rounded-full bg-gradient-to-r from-[var(--n9-accent)]/60 to-transparent"
        />
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
    <section ref={sectionRef} className="relative bg-[var(--n9-accent-light)]/50 dark:bg-muted/10">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-16"
        >
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Built for how labs actually work
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            Every feature is designed to reduce friction and keep context flowing.
          </p>
        </motion.div>

        <div className="relative mx-auto max-w-6xl">
          {/* Scroll progress line (desktop only) */}
          <div className="absolute left-1/2 top-0 bottom-0 hidden w-[2px] -translate-x-1/2 bg-border/30 lg:block" aria-hidden="true">
            <motion.div
              style={{ height: lineHeight }}
              className="w-full bg-gradient-to-b from-[var(--n9-accent)]/60 to-[var(--n9-accent)]/20 rounded-full"
            />
          </div>

          {/* Feature node dots on the timeline */}
          <div className="absolute left-1/2 top-0 bottom-0 hidden -translate-x-1/2 lg:block" aria-hidden="true">
            {features.map((_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                viewport={{ once: true }}
                className="absolute left-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-[var(--n9-accent)]/60 bg-background"
                style={{ top: `${(i / (features.length - 1)) * 100}%` }}
              />
            ))}
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
