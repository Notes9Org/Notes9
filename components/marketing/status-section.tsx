"use client"

import { motion } from "framer-motion"
import { AnimatedCounter } from "@/components/marketing/animated-counter"

const metrics = [
  {
    value: "42%",
    label: "of faculty time on funded research goes to admin burden instead of science.",
    source: "FDP Faculty Burden Survey",
  },
  {
    value: "~5 hrs",
    label: "per week researchers spend searching for or re-documenting context.",
    source: "Nature & Elsevier workflow studies",
  },
  {
    value: "70%+",
    label: "of researchers tried and failed to reproduce another scientist's experiments.",
    source: "Nature reproducibility survey",
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.2 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
}

export function StatusSection() {
  return (
    <section id="after-interactive-preview" className="border-t border-border/40">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            The problem is real and measurable
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            Fragmented workflows cost labs real time and money every week.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-3"
        >
          {metrics.map((m) => (
            <motion.div
              key={m.value}
              variants={itemVariants}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 p-6 text-center backdrop-blur-sm transition-colors duration-300 hover:border-[var(--n9-accent)]/30 dark:bg-card/60"
            >
              <div className="text-4xl font-bold tracking-tight text-[var(--n9-accent)]">
                <AnimatedCounter value={m.value} />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {m.label}
              </p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                {m.source}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
