"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const points = [
  "Context stays connected across literature, experiments, and decisions",
  "Structured capture replaces memory and manual search",
  "Linked records make summaries and handoffs effortless",
]

export function DifferentiationSection() {
  return (
    <section className="bg-[var(--n9-accent-light)] dark:bg-muted/20">
      <div className="container mx-auto px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl"
          >
            See how Notes9 can work for your lab
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
            className="mt-4 text-lg leading-7 text-muted-foreground"
          >
            Walk us through your current workflow. We&apos;ll show you where Notes9 saves time and reduces friction.
          </motion.p>

          <motion.ul
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
            className="mx-auto mt-8 max-w-md space-y-3 text-left"
          >
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--n9-accent)]" />
                <span className="text-base leading-7 text-muted-foreground">{point}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            viewport={{ once: true }}
            className="mt-10 flex justify-center"
          >
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-[var(--n9-accent)] px-8 text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)] cursor-pointer"
            >
              <Link href="/#contact">
                Request a demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
