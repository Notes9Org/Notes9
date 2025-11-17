"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, X } from "lucide-react"
import { motion } from "framer-motion"

const comparisons = [
  {
    category: "Proactive vs. Reactive",
    traditional: "Store data when you remember to enter it",
    notes9: "Understands your research context and suggests next steps before you ask",
  },
  {
    category: "Intelligent vs. Static",
    traditional: "Digital filing cabinets with search functions",
    notes9: "AI that connects experiments, literature, and insights across your entire research program",
  },
  {
    category: "Predictive vs. Historical",
    traditional: "Show you what happened",
    notes9: "Predict what should happen next and help you get there faster",
  },
]

const proofPoints = [
  {
    metric: "3x faster",
    description: "hypothesis generation",
    detail: "Early adopters report 3x faster hypothesis generation",
  },
  {
    metric: "40% increase",
    description: "meaningful connections",
    detail: "40% increase in meaningful cross-experiment connections",
  },
  {
    metric: "60% reduction",
    description: "manual tasks",
    detail: "60% reduction in manual data management tasks",
  },
  {
    metric: "90% fewer",
    description: "compliance issues",
    detail: "90% fewer citation errors and regulatory compliance issues",
  },
]

export function DifferentiationSection() {
  return (
    <section className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Why Choose Notes9
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-solid sm:text-4xl text-balance mb-6">
            Why Researchers Choose{" "}
            <span className="text-solid font-semibold">
              Agentic Intelligence
            </span>{" "}
            Over Traditional ELN
          </h2>

          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
              <h3 className="font-semibold text-solid mb-2">The Problem with Traditional ELNs</h3>
              <p className="text-solid">
                Current ELN platforms are glorified digital notebooks—they store data but don't understand it.
                Researchers waste 60% of their time on manual tasks: searching through notebooks, formatting citations,
                tracking inventory, and analyzing data.
              </p>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
              <h3 className="font-semibold text-solid mb-2">Our Unique Solution: True Agentic Intelligence</h3>
              <p className="text-solid">
                Notes9 doesn't just digitize your notebook—it becomes your intelligent research partner. Our AI agents
                proactively assist, predict needs, and accelerate discoveries by understanding the science behind your
                work.
              </p>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center text-foreground mb-8">Competitive Advantages</h3>
          <div className="space-y-6">
            {comparisons.map((comparison, index) => (
              <motion.div
                key={comparison.category}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                viewport={{ once: true }}
              >
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
                      <div className="p-6 bg-muted/50">
                        <h4 className="font-semibold text-foreground mb-2">{comparison.category}</h4>
                      </div>

                      <div className="p-6 bg-destructive/5">
                        <div className="flex items-start space-x-3">
                          <X className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                          <div>
                            <h5 className="font-medium text-foreground mb-1">Traditional ELNs</h5>
                            <p className="text-sm text-muted-foreground">{comparison.traditional}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-primary/5">
                        <div className="flex items-start space-x-3">
                          <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <h5 className="font-medium text-foreground mb-1">Notes9</h5>
                            <p className="text-sm text-muted-foreground">{comparison.notes9}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Proof Points */}
        <div>
          <h3 className="text-2xl font-bold text-center text-foreground mb-8">Proven Results</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {proofPoints.map((point, index) => (
              <motion.div
                key={point.metric}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
              >
                <Card className="text-center p-6 h-full bg-card/50 backdrop-blur border-2 hover:border-primary/20 transition-all duration-300">
                  <div className="text-3xl font-bold text-primary mb-2">{point.metric}</div>
                  <div className="text-sm font-medium text-foreground mb-2">{point.description}</div>
                  <div className="text-xs text-muted-foreground">{point.detail}</div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
