"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Microscope, Atom, GraduationCap, Shield, ArrowRight, CheckCircle } from "lucide-react"
import { motion } from "framer-motion"

const industries = [
  {
    icon: Microscope,
    title: "Biotechnology & Pharmaceuticals",
    subtitle: "Accelerate Drug Discovery with Agentic Intelligence",
    useCases: ["Target identification", "Lead optimization", "Clinical trial data"],
    features: ["Regulatory compliance automation", "Protocol optimization"],
    value: "Reduce time-to-market by intelligently connecting discovery insights",
  },
  {
    icon: Atom,
    title: "Materials Science & Engineering",
    subtitle: "Innovate Faster with AI-Guided Materials Research",
    useCases: ["Materials characterization", "Property prediction", "Process optimization"],
    features: ["Materials database integration", "Characterization workflows"],
    value: "Discover new materials through intelligent experiment design",
  },
  {
    icon: GraduationCap,
    title: "Academic Research Institutions",
    subtitle: "Empower Student Success with Intelligent Lab Management",
    useCases: ["Teaching labs", "Graduate research", "Collaborative projects"],
    features: ["Educational workflows", "Collaboration tools", "Literature training"],
    value: "Accelerate research training and improve reproducibility",
  },
  {
    icon: Shield,
    title: "Quality Control & Testing",
    subtitle: "Ensure Compliance with Intelligent QC Workflows",
    useCases: ["Method validation", "Batch testing", "Regulatory reporting"],
    features: ["SOP automation", "Deviation tracking", "Report generation"],
    value: "Reduce compliance risk with AI-guided quality processes",
  },
]

const roles = [
  {
    title: "Principal Investigators",
    subtitle: "Focus on Science, Not Administration",
    description: "Let our agentic AI handle routine lab management while you drive breakthrough research",
  },
  {
    title: "Research Scientists",
    subtitle: "Your Intelligent Lab Partner",
    description: "Accelerate discoveries with AI that understands your research and suggests optimal next steps",
  },
  {
    title: "Lab Managers",
    subtitle: "Streamline Operations with Predictive Intelligence",
    description: "Optimize resource allocation and ensure compliance with AI-powered lab management",
  },
  {
    title: "IT Directors",
    subtitle: "Enterprise-Ready AI Platform",
    description: "Deploy cutting-edge research tools with enterprise security and seamless integration",
  },
]

export function IndustryTargetingSection() {
  return (
    <section className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Industry Solutions
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Tailored for Every{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Research Domain
            </span>
          </h2>
        </div>

        {/* Industry Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {industries.map((industry, index) => (
            <motion.div
              key={industry.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
            >
              <Card className="h-full transition-all duration-300 hover:shadow-xl border-2 hover:border-primary/20">
                <CardHeader>
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <industry.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold text-foreground">{industry.title}</CardTitle>
                      <p className="text-sm text-primary font-medium">{industry.subtitle}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Use Cases:</h4>
                    <div className="flex flex-wrap gap-2">
                      {industry.useCases.map((useCase, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {useCase}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Specific Features:</h4>
                    <ul className="space-y-1">
                      {industry.features.map((feature, i) => (
                        <li key={i} className="flex items-start space-x-2 text-sm text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-primary/5 rounded-lg p-4">
                    <h4 className="font-semibold text-foreground mb-2">Value Proposition:</h4>
                    <p className="text-sm text-muted-foreground italic">"{industry.value}"</p>
                  </div>

                  <Button variant="outline" className="w-full group bg-transparent">
                    Learn More
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Role-Based Messaging */}
        <div>
          <h3 className="text-2xl font-bold text-center text-foreground mb-8">Solutions for Every Role</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {roles.map((role, index) => (
              <motion.div
                key={role.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                viewport={{ once: true }}
              >
                <Card className="p-6 h-full bg-card/50 backdrop-blur border-2 hover:border-primary/20 transition-all duration-300">
                  <h4 className="font-bold text-foreground mb-2">{role.title}</h4>
                  <h5 className="text-primary font-semibold mb-3">{role.subtitle}</h5>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
