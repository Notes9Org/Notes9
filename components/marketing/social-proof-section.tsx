"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Star, Quote } from "lucide-react"
import { motion } from "framer-motion"

const testimonials = [
  {
    name: "Dr. Sarah Chen",
    role: "Principal Investigator",
    company: "Biotech Startup",
    avatar: "SC",
    quote:
      "Notes9's agentic intelligence has transformed our drug discovery pipeline. The AI doesn't just store our data—it actively helps us identify promising compounds and suggests experimental paths we wouldn't have considered. We've accelerated our timeline by months.",
    rating: 5,
  },
  {
    name: "Prof. Michael Rodriguez",
    role: "Materials Science Department",
    company: "Stanford University",
    avatar: "MR",
    quote:
      "The literature intelligence feature alone has revolutionized how our students approach research. Instead of spending weeks on literature reviews, they get comprehensive, AI-curated insights in hours, allowing more time for actual experimentation.",
    rating: 5,
  },
  {
    name: "Dr. Lisa Park",
    role: "Quality Control Director",
    company: "Pharmaceutical Company",
    avatar: "LP",
    quote:
      "The compliance automation in Notes9 has eliminated our regulatory audit anxiety. The AI ensures every protocol follows GLP guidelines and automatically generates audit-ready documentation. It's like having a compliance expert built into our workflow.",
    rating: 5,
  },
]

const metrics = [
  {
    value: "3x faster",
    label: "hypothesis-to-experiment cycles",
    description: "Average research acceleration",
  },
  {
    value: "40% increase",
    label: "successful experimental outcomes",
    description: "Discovery rate improvement",
  },
  {
    value: "99.8%",
    label: "regulatory compliance rate",
    description: "Across all implementations",
  },
  {
    value: "4.9/5",
    label: "average rating",
    description: "From research teams",
  },
]

const trustIndicators = [
  "Join 50+ leading research institutions",
  "Published case studies in Nature Methods",
  "Winner: Best AI Innovation in Life Sciences 2025",
  "SOC 2 Type II, ISO 27001 certified",
]

export function SocialProofSection() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Trusted by Researchers
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Accelerating Discovery at{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Leading Institutions
            </span>
          </h2>
        </div>

        {/* Success Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.05 }}
            >
              <Card className="text-center p-6 bg-primary/5 border-2 border-primary/20">
                <div className="text-3xl font-bold text-primary mb-2">{metric.value}</div>
                <div className="text-sm font-medium text-foreground mb-1">{metric.label}</div>
                <div className="text-xs text-muted-foreground">{metric.description}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
            >
              <Card className="h-full p-6 transition-all duration-300 hover:shadow-xl border-2 hover:border-primary/20">
                <CardContent className="p-0 space-y-4">
                  <div className="flex items-center space-x-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>

                  <div className="relative">
                    <Quote className="absolute -top-2 -left-2 h-8 w-8 text-solid" />
                    <p className="text-muted-foreground italic leading-relaxed pl-6">{testimonial.quote}</p>
                  </div>

                  <div className="flex items-center space-x-3 pt-4 border-t">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {testimonial.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-foreground">{testimonial.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {testimonial.role}, {testimonial.company}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Trust Indicators */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Card className="bg-secondary/50 border-2 border-primary/10">
            <CardContent className="p-8">
              <h3 className="text-xl font-bold text-center text-foreground mb-6">Trusted & Recognized</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trustIndicators.map((indicator, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{indicator}</span>
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
