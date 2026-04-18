"use client"

import Link from "next/link"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const points = [
  {
    title: "Connected Context",
    desc: "Context stays connected across literature, experiments, and decisions so you never lose the core rationale.",
  },
  {
    title: "Structured Memory",
    desc: "Structured capture replaces transient lab memory and manual search, giving you instant recall.",
  },
  {
    title: "Effortless Handoffs",
    desc: "Linked records make writing protocol summaries and handling collaborator handoffs completely effortless.",
  },
]

function InteractiveGlowCard({ point, index }: { point: typeof points[0]; index: number }) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect()
    mouseX.set(e.clientX - left)
    mouseY.set(e.clientY - top)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
      viewport={{ once: true }}
      onMouseMove={handleMouseMove}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/50 bg-background/50 p-6 shadow-sm transition-colors hover:border-[var(--n9-accent)]/40 hover:bg-background"
    >
      <motion.div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              300px circle at ${mouseX}px ${mouseY}px,
              var(--n9-accent-glow),
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative z-10 flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[var(--n9-accent)]" />
        <div>
          <h3 className="font-semibold text-foreground">{point.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{point.desc}</p>
        </div>
      </div>
    </motion.div>
  )
}

export function DifferentiationSection() {
  return (
    <section className="bg-[var(--n9-accent-light)] dark:bg-muted/10">
      <div className="container mx-auto px-4 py-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.h2
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            viewport={{ once: true }}
            className="font-serif text-3xl tracking-tight text-foreground sm:text-5xl"
          >
            See how Notes9 fits your lab
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
            className="mt-6 text-lg leading-8 text-muted-foreground mx-auto max-w-2xl"
          >
            Walk us through your current workflow. We&apos;ll show you where Notes9 saves time, organizes messy folders, and reduces manual friction.
          </motion.p>

          <div className="mx-auto mt-16 grid gap-6 text-left sm:grid-cols-3">
            {points.map((point, i) => (
              <InteractiveGlowCard key={point.title} point={point} index={i} />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            viewport={{ once: true }}
            className="mt-16 flex justify-center"
          >
            <Button
              asChild
              size="lg"
              className="h-14 rounded-full bg-[var(--n9-accent)] px-10 text-white text-base shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)] transition-all hover:scale-105 hover:shadow-[0_20px_50px_-12px_var(--n9-accent-glow)] cursor-pointer"
            >
              <Link href="/#contact">
                Request a personalized demo
                <ArrowRight className="ml-3 h-5 w-5" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
