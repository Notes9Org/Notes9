"use client"

import { motion } from "framer-motion"
import { AnimatedCounter } from "@/components/marketing/animated-counter"
import { SectionHeader } from "@/components/marketing/site-ui"

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
    transition: { duration: 0.5 },
  },
}

export function StatusSection() {
  return (
    <section className="marketing-section-alt border-t border-border/40">
      <div className="container relative z-[1] mx-auto px-4 py-20 sm:px-6 lg:px-8">
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
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
            You read a paper in PubMed, take notes in Notion, run the experiment in your ELN, and write the report in
            Word — each step lives in a different silo. By the time you&apos;re writing, you&apos;ve re-explained your
            research four times to tools that don&apos;t talk to each other.
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
              className="marketing-glass-surface group relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-6 text-center transition-colors duration-300 hover:border-[var(--n9-accent)]/30 dark:bg-card/55"
            >
              <div className="text-4xl font-bold tracking-tight text-[var(--n9-accent)]">
                <AnimatedCounter value={m.value} />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{m.label}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">{m.source}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          viewport={{ once: true }}
          className="mx-auto mt-16 max-w-[88rem]"
        >
          <div className="flex flex-col rounded-[36px] border border-[var(--n9-accent)]/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,242,236,0.92))] p-6 shadow-[0_28px_90px_-44px_rgba(44,36,24,0.24)] backdrop-blur-sm dark:border-[var(--n9-accent)]/12 dark:bg-[radial-gradient(circle_at_top,rgba(165,214,167,0.08),transparent_30%),linear-gradient(180deg,rgba(22,28,24,0.98),rgba(10,14,12,0.99))] dark:shadow-[0_32px_100px_-44px_rgba(0,0,0,0.72)] sm:p-8 lg:p-10">
            <SectionHeader
              badge="Connected Research System"
              title="Every time you switch tools, you lose an hour"
              className="max-w-none text-left"
            />
            <p className="mt-4 w-full text-justify text-base leading-7 text-muted-foreground sm:text-lg">
              You read a paper in PubMed. Take notes in Notion. Run the experiment in your ELN. Write the report in
              Word. By the time you&apos;re writing, you&apos;ve re-explained your research four times — to four tools
              that don&apos;t talk to each other. Catalyst AI reads all of it at once.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="marketing-glass-surface rounded-[18px] border border-border/50 bg-background/55 px-4 py-4 dark:border-white/10 dark:bg-white/[0.06]">
                <p className="font-serif text-xl font-semibold tabular-nums text-foreground">5 hr / week</p>
                <p className="mt-2 text-sm leading-snug text-muted-foreground">
                  Average time researchers spend reconstructing context they already had somewhere else.
                </p>
              </div>
              <div className="marketing-glass-surface rounded-[18px] border border-border/50 bg-background/55 px-4 py-4 dark:border-white/10 dark:bg-white/[0.06]">
                <p className="font-serif text-xl font-semibold tabular-nums text-foreground">4+ tools</p>
                <p className="mt-2 text-sm leading-snug text-muted-foreground">
                  Typical lab stack for pre-IND work — each with its own siloed memory.
                </p>
              </div>
              <div className="marketing-glass-surface rounded-[18px] border border-border/50 bg-background/55 px-4 py-4 dark:border-white/10 dark:bg-white/[0.06]">
                <p className="font-serif text-xl font-semibold tabular-nums text-foreground">0 context</p>
                <p className="mt-2 text-sm leading-snug text-muted-foreground">
                  What your writing tool knows about your experiments unless you paste it in again.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/65 dark:text-slate-400 sm:grid-cols-3">
              <div className="marketing-glass-surface rounded-[18px] border border-border/50 bg-background/48 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]">
                Evidence stays linked
              </div>
              <div className="marketing-glass-surface rounded-[18px] border border-border/50 bg-background/48 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]">
                Catalyst AI sees full context
              </div>
              <div className="marketing-glass-surface rounded-[18px] border border-border/50 bg-background/48 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]">
                Writing reflects the work
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
