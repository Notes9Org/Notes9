"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, Search, Database, BarChart3, Package, Users, FlaskConical, Clock } from "lucide-react"
import { motion } from "framer-motion"

const activeFeatures = [
  {
    icon: Search,
    title: "Agentic Literature Review",
    description:
      "Automated semantic search across multiple databases. The agent ranks papers, generates summaries, and identifies key experimental protocols relevant to your work.",
    status: "active"
  },
  {
    icon: Database,
    title: "Structured Data Entry",
    description:
      "Context-aware lab notebook that organizes your experimental data. Automatically links finding to protocols and enables structured retrieval.",
    status: "active"
  },
  {
    icon: Brain,
    title: "AI-Powered Analysis",
    description:
      "RAG-enabled insights into your own data. Ask questions in natural language to uncover patterns and generate publication-ready figures.",
    status: "active"
  }
]

const devFeatures = [
  {
    icon: Package,
    title: "Smart Inventory",
    description: "Reagent tracking and supply chain prediction.",
    status: "dev"
  },
  {
    icon: FlaskConical,
    title: "Regulatory Compliance",
    description: "Automated compliance checks and audit trails.",
    status: "dev"
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Real-time sharing of protocols and results.",
    status: "dev"
  }
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Core Capabilities
          </h2>
          <p className="mt-4 text-lg text-foreground/80 whitespace-pre-wrap">Empowering researchers with next-generation tools.</p>
        </div>

        {/* Active Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {activeFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              viewport={{ once: true }}
            >
              <Card className="h-full border border-border/60 bg-card/50 hover:bg-card hover:shadow-sm transition-all">
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-bold text-foreground">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground/80 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Development Features */}
        <div className="border-t border-border pt-16">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-2">Roadmap</Badge>
            <h3 className="text-2xl font-semibold text-foreground">Under Active Development</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {devFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Card className="h-full border border-border/40 bg-muted/20 opacity-80">
                  <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                    <div className="p-2 bg-muted rounded-md">
                      <feature.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col">
                      <CardTitle className="text-lg font-semibold text-foreground/80">
                        {feature.title}
                      </CardTitle>
                      <span className="text-xs font-medium text-amber-500 flex items-center mt-1">
                        <Clock className="w-3 h-3 mr-1" />
                        Coming Soon
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
