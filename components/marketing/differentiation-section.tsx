"use client"

import { Check, X } from "lucide-react"

export function DifferentiationSection() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why Upgrade to Agentic?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Traditional ELNs are passive repositories. Notes9 is an active research partner.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Technological Differentiation */}
          <div className="space-y-8">
            <h3 className="text-2xl font-semibold mb-6 border-l-4 border-primary pl-4">Technological Architecture</h3>

            <div className="bg-background rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <span className="font-semibold text-muted-foreground">Standard ELN</span>
                <span className="font-bold text-primary">Notes9 Agentic ELN</span>
              </div>
              <ul className="space-y-4">
                <li className="grid grid-cols-2 gap-4 items-center">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <X className="w-4 h-4 mr-2 text-red-400 flex-shrink-0" />
                    Passive data storage
                  </div>
                  <div className="flex items-center text-sm font-medium">
                    <Check className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                    Proactive recommendations
                  </div>
                </li>
                <li className="grid grid-cols-2 gap-4 items-center">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <X className="w-4 h-4 mr-2 text-red-400 flex-shrink-0" />
                    Manual data entry
                  </div>
                  <div className="flex items-center text-sm font-medium">
                    <Check className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                    Automated Contextual Entry
                  </div>
                </li>
                <li className="grid grid-cols-2 gap-4 items-center">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <X className="w-4 h-4 mr-2 text-red-400 flex-shrink-0" />
                    Siloed from literature
                  </div>
                  <div className="flex items-center text-sm font-medium">
                    <Check className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                    Integrated RAG Literature Search
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* User Feature Differentiation */}
          <div className="space-y-8">
            <h3 className="text-2xl font-semibold mb-6 border-l-4 border-primary pl-4">Unified Research Cycle</h3>
            <div className="bg-background rounded-xl border border-border p-8 shadow-sm">
              <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                Most labs rely on a fragmented stack: one tool for literature (e.g., Zotero), one for notes (e.g., Benchling/LabArchives), and another for analysis (Prism/R/Python).
              </p>
              <p className="text-lg font-medium text-foreground">
                Notes9 unifies these into a single workflow.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium dark:bg-blue-900 dark:text-blue-100">Literature Review</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-sm font-medium dark:bg-purple-900 dark:text-purple-100">Experiment Design</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-medium dark:bg-green-900 dark:text-green-100">Data Capture</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-sm font-medium dark:bg-orange-900 dark:text-orange-100">AI Analysis</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
