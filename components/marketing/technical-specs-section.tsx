"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Cloud, Shield, Zap, Database, Cpu, Globe, CheckCircle, Lock } from "lucide-react"
import { motion } from "framer-motion"

const architectureFeatures = [
  {
    icon: Cloud,
    title: "Cloud-Native Infrastructure",
    description:
      "Built from the ground up for AI-first research workflows with enterprise-grade security and compliance",
  },
  {
    icon: Zap,
    title: "Sub-2s AI Response Times",
    description: "High-performance AI queries with WebGL 2.0 support and responsive design optimized for all devices",
  },
  {
    icon: Database,
    title: "200+ Pre-built Integrations",
    description:
      "Universal import/export with REST, GraphQL, and WebSocket endpoints plus direct lab equipment connectivity",
  },
  {
    icon: Cpu,
    title: "Advanced AI & ML Stack",
    description: "GPT-4, Claude, domain-specific models with vector database and custom multi-agent orchestration",
  },
]

const complianceFeatures = [
  {
    icon: Shield,
    title: "FDA 21 CFR Part 11",
    description: "Electronic records and signatures compliance",
  },
  {
    icon: CheckCircle,
    title: "GLP & ISO 27001",
    description: "Good Laboratory Practice and information security management",
  },
  {
    icon: Globe,
    title: "GDPR & HIPAA",
    description: "European data protection and healthcare data protection",
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    description: "AES-256 encryption, MFA, SSO, and blockchain-verified audit trails",
  },
]

const validationSupport = [
  "Installation Qualification (IQ): Automated system verification",
  "Operational Qualification (OQ): Workflow validation packages",
  "Performance Qualification (PQ): Custom performance testing",
  "Documentation: Complete validation documentation packages",
]

export function TechnicalSpecsSection() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Technical Excellence
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Enterprise-Grade{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Platform Architecture
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Built from the ground up for AI-first research workflows with enterprise-grade security and compliance
          </p>
        </div>

        {/* Platform Architecture */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">Platform Architecture</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {architectureFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                viewport={{ once: true }}
                whileHover={{ y: -5 }}
              >
                <Card className="h-full transition-all duration-300 hover:shadow-lg border-2 hover:border-primary/20">
                  <CardHeader>
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <feature.icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg font-semibold text-foreground">{feature.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Compliance & Security */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">Compliance & Security</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {complianceFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
              >
                <Card className="text-center p-6 h-full bg-card/50 backdrop-blur border-2 hover:border-primary/20 transition-all duration-300">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h4 className="font-semibold text-foreground mb-2">{feature.title}</h4>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Validation Support */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Card className="bg-primary/5 border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground text-center">Validation Support</CardTitle>
              <p className="text-center text-muted-foreground">
                Complete validation packages for regulated environments
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {validationSupport.map((item, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
