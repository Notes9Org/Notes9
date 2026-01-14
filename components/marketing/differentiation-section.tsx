
"use client"

import { Check, X, ArrowRight, HardDrive, Zap, Keyboard, Wand2, FileX, Network } from "lucide-react"
import { motion, Variants } from "framer-motion"

// Animation variants
const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
}

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 80, damping: 12 } },
}

const flowContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
}

const flowItem: Variants = {
  hidden: { opacity: 0, scale: 0.8, x: -20 },
  show: { opacity: 1, scale: 1, x: 0, transition: { type: "spring", stiffness: 100 } },
}

export function DifferentiationSection() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why Upgrade to Agentic?
          </h2>
          <p className="mt-4 text-lg text-foreground/80 max-w-2xl mx-auto">
            Traditional ELNs are passive repositories. Notes9 is an active research partner.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Technological Architecture */}
          <div className="space-y-8">
            <h3 className="text-2xl font-semibold mb-6 border-l-4 border-primary pl-4">Technological Architecture</h3>

            <div className="bg-background rounded-xl border border-border p-6 shadow-sm">
              <div className="grid grid-cols-2 gap-x-6 mb-6 pb-4 border-b border-border/60">
                <div className="text-center">
                  <span className="font-semibold text-foreground/70 block mb-1">Standard ELN</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Passive</span>
                </div>
                <div className="text-center bg-primary/5 rounded-md py-1 -mx-2">
                  <span className="font-bold text-primary block mb-1">Notes9 Agentic ELN</span>
                  <span className="text-xs text-primary/80 uppercase tracking-wider">Active</span>
                </div>
              </div>

              <motion.div
                className="space-y-6"
                variants={container}
                initial="hidden"
                whileInView="show"
                viewport={{ once: false, amount: 0.3 }}
              >
                {/* Row 1 */}
                <motion.div variants={item} className="grid grid-cols-2 gap-6 items-center">
                  <div className="flex flex-col items-center text-center space-y-2 p-3 rounded-lg hover:bg-muted/40 transition-colors">
                    <div className="p-2 bg-muted rounded-full">
                      <HardDrive className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-foreground/70 font-medium">Passive data storage</span>
                  </div>
                  <div className="flex flex-col items-center text-center space-y-2 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors border border-primary/10">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-primary">Proactive recommendations</span>
                  </div>
                </motion.div>

                {/* Row 2 */}
                <motion.div variants={item} className="grid grid-cols-2 gap-6 items-center">
                  <div className="flex flex-col items-center text-center space-y-2 p-3 rounded-lg hover:bg-muted/40 transition-colors">
                    <div className="p-2 bg-muted rounded-full">
                      <Keyboard className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-foreground/70 font-medium">Manual data entry</span>
                  </div>
                  <div className="flex flex-col items-center text-center space-y-2 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors border border-primary/10">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <Wand2 className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-primary">Automated Contextual Entry</span>
                  </div>
                </motion.div>

                {/* Row 3 */}
                <motion.div variants={item} className="grid grid-cols-2 gap-6 items-center">
                  <div className="flex flex-col items-center text-center space-y-2 p-3 rounded-lg hover:bg-muted/40 transition-colors">
                    <div className="p-2 bg-muted rounded-full">
                      <FileX className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-foreground/70 font-medium">Siloed from literature</span>
                  </div>
                  <div className="flex flex-col items-center text-center space-y-2 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors border border-primary/10">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <Network className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-primary">Integrated RAG Search</span>
                  </div>
                </motion.div>

              </motion.div>
            </div>
          </div>

          {/* Unified Research Cycle */}
          <div className="space-y-8">
            <h3 className="text-2xl font-semibold mb-6 border-l-4 border-primary pl-4">Unified Research Cycle</h3>
            <div className="bg-background rounded-xl border border-border p-8 shadow-sm h-full">
              <p className="text-lg text-foreground/80 leading-relaxed mb-6">
                Most labs rely on a fragmented stack: one tool for literature, one for notes, and another for analysis.
              </p>
              <p className="text-lg font-medium text-foreground mb-8">
                Notes9 unifies these into a single workflow.
              </p>

              <motion.div
                className="flex flex-col gap-4"
                variants={flowContainer}
                initial="hidden"
                whileInView="show"
                viewport={{ once: false, amount: 0.3 }}
              >
                <div className="relative pl-8 border-l-2 border-dashed border-primary/20 space-y-8 py-2">
                  <motion.div variants={flowItem} className="relative">
                    <span className="absolute -left-[41px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-100 border-2 border-blue-200 flex items-center justify-center z-10 dark:bg-blue-900 dark:border-blue-800">1</span>
                    <div className="bg-card border border-blue-100 dark:border-blue-900 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                      <h4 className="font-semibold text-blue-700 dark:text-blue-300">Literature Review</h4>
                      <p className="text-xs text-muted-foreground mt-1">Automated semantic search & synthesis</p>
                    </div>
                  </motion.div>

                  <motion.div variants={flowItem} className="relative">
                    <span className="absolute -left-[41px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-purple-100 border-2 border-purple-200 flex items-center justify-center z-10 dark:bg-purple-900 dark:border-purple-800">2</span>
                    <div className="bg-card border border-purple-100 dark:border-purple-900 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                      <h4 className="font-semibold text-purple-700 dark:text-purple-300">Experiment Design</h4>
                      <p className="text-xs text-muted-foreground mt-1">Protocol generation from literature</p>
                    </div>
                  </motion.div>

                  <motion.div variants={flowItem} className="relative">
                    <span className="absolute -left-[41px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center z-10 dark:bg-green-900 dark:border-green-800">3</span>
                    <div className="bg-card border border-green-100 dark:border-green-900 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                      <h4 className="font-semibold text-green-700 dark:text-green-300">Data Capture</h4>
                      <p className="text-xs text-muted-foreground mt-1">Context-aware structured entry</p>
                    </div>
                  </motion.div>

                  <motion.div variants={flowItem} className="relative">
                    <span className="absolute -left-[41px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-orange-100 border-2 border-orange-200 flex items-center justify-center z-10 dark:bg-orange-900 dark:border-orange-800">4</span>
                    <div className="bg-card border border-orange-100 dark:border-orange-900 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                      <h4 className="font-semibold text-orange-700 dark:text-orange-300">AI Analysis</h4>
                      <p className="text-xs text-muted-foreground mt-1">RAG-enabled insights & figures</p>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

