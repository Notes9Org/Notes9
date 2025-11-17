"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, Search, Package, BarChart3, GitBranch, Plug, ArrowRight, CheckCircle } from "lucide-react"
import { motion } from "framer-motion"

const features = [
  {
    icon: Brain,
    title: "Proactive Research Guidance",
    description:
      "Your AI assistant doesn't just store data—it understands your research context, suggests next steps, identifies patterns, and proactively connects related experiments across your lab's knowledge base.",
    benefits: [
      "Intelligent protocol suggestions",
      "Automated literature connections",
      "Context-aware next-step recommendations",
      "Cross-experiment pattern recognition",
    ],
  },
  {
    icon: Search,
    title: "Instant Research Intelligence",
    description:
      "Cut literature review time by 80%. Our AI scans multiple databases, ranks papers by relevance, generates concise summaries, and automatically formats citations—letting you focus on science, not search.",
    benefits: [
      "Multi-database semantic search",
      "Automated relevance ranking",
      "Bullet-point summaries",
      "Perfect citation formatting",
    ],
  },
  {
    icon: Package,
    title: "Predictive Supply Intelligence",
    description:
      "Never run out of critical reagents again. Our agent tracks real-time consumption, predicts usage patterns, flags expiry risks, and intelligently sources vetted suppliers with regulatory compliance verification.",
    benefits: [
      "Real-time consumption tracking",
      "Expiry risk prediction",
      "Intelligent supplier sourcing",
      "Regulatory compliance verification",
    ],
  },
  {
    icon: BarChart3,
    title: "Conversational Analytics",
    description:
      "Ask questions in natural language and get publication-ready results. Our AI fetches relevant datasets, runs statistical analysis, generates visualizations, and drafts plain-language summaries of your findings.",
    benefits: [
      "Natural language queries",
      "Automated statistical analysis",
      "Publication-ready visualizations",
      "Plain-language insights",
    ],
  },
  {
    icon: GitBranch,
    title: "Intelligent Research Workflows",
    description:
      "Transform final deliverables with automated reporting. Our AI assembles tables, figures, and citations into live drafts that update with new data, requiring only your approval for key decisions.",
    benefits: [
      "Automated report generation",
      "Live-updating drafts",
      "Multi-format export (papers, slides, reports)",
      "Template management",
    ],
  },
  {
    icon: Plug,
    title: "Universal Lab Connectivity",
    description:
      "Seamlessly connect with 200+ pre-built integrations. Our platform unifies disparate lab tools into a cohesive agentic ecosystem that learns and adapts to your unique research workflows.",
    benefits: [
      "200+ pre-built integrations",
      "Custom API endpoints",
      "Real-time data synchronization",
      "Workflow automation",
    ],
  },
]

export function FeaturesSection() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Core Features
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-solid sm:text-4xl text-balance">
            Beyond Traditional ELN - Meet Your{" "}
            <span className="text-solid font-semibold">
              Agentic Research Assistant
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className="group"
            >
              <Card className="h-full transition-all duration-300 hover:shadow-xl border-2 hover:border-primary/20">
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-foreground">Key Benefits:</h4>
                    <ul className="space-y-1">
                      {feature.benefits.map((benefit, i) => (
                        <li key={i} className="flex items-start space-x-2 text-sm text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2">
                    <div className="flex items-center text-primary text-sm font-medium group-hover:text-accent transition-colors">
                      Learn more <ArrowRight className="ml-1 h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
