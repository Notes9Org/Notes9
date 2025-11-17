"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle, Star, ArrowRight } from "lucide-react"
import { motion } from "framer-motion"

const pricingTiers = [
  {
    name: "Individual Researcher",
    price: "$0",
    period: "/month",
    description: "Perfect for students and early-career researchers",
    badge: "Free",
    badgeVariant: "secondary" as const,
    features: ["Basic notebook functionality", "Limited AI queries (50/month)", "5GB storage", "Community support"],
    cta: "Start Free",
    ctaVariant: "outline" as const,
    popular: false,
  },
  {
    name: "Professional Team",
    price: "$29",
    period: "/user/month",
    description: "For research teams and small labs",
    badge: "Most Popular",
    badgeVariant: "default" as const,
    features: [
      "Unlimited AI features",
      "Advanced collaboration tools",
      "100GB storage per user",
      "Priority support",
      "Basic compliance features",
    ],
    cta: "Start 14-Day Trial",
    ctaVariant: "default" as const,
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "starting at $50,000/year",
    description: "For pharmaceutical companies and large institutions",
    badge: "Enterprise",
    badgeVariant: "secondary" as const,
    features: [
      "Full regulatory compliance (21 CFR Part 11, GLP)",
      "Private cloud deployment",
      "Advanced security features",
      "Custom integrations",
      "Dedicated success manager",
      "Training and onboarding",
    ],
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
    popular: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Transparent Pricing
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            Value-Based Pricing for{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Research Excellence
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Our pricing scales with your research impact, not arbitrary user counts
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {pricingTiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className={tier.popular ? "lg:scale-105" : ""}
            >
              <Card
                className={`h-full transition-all duration-300 hover:shadow-xl ${
                  tier.popular
                    ? "border-2 border-primary shadow-lg ring-2 ring-primary/20"
                    : "border-2 hover:border-primary/20"
                }`}
              >
                <CardHeader className="text-center pb-8">
                  <div className="flex justify-center mb-4">
                    <Badge variant={tier.badgeVariant} className={tier.popular ? "animate-pulse-glow" : ""}>
                      {tier.popular && <Star className="mr-1 h-3 w-3 fill-current" />}
                      {tier.badge}
                    </Badge>
                  </div>

                  <CardTitle className="text-2xl font-bold text-foreground">{tier.name}</CardTitle>

                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                    <span className="text-muted-foreground">{tier.period}</span>
                  </div>

                  <p className="text-sm text-muted-foreground mt-2">{tier.description}</p>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start space-x-3">
                        <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={tier.ctaVariant}
                    size="lg"
                    className={`w-full ${tier.popular ? "animate-pulse-glow" : ""}`}
                  >
                    {tier.cta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Academic Discount */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Card className="bg-accent/10 border-2 border-accent/20 text-center p-8">
            <h3 className="text-xl font-bold text-foreground mb-4">Academic Discount Available</h3>
            <p className="text-muted-foreground mb-4">
              50% off Professional plans for academic institutions with verification required
            </p>
            <Button variant="outline">Learn About Academic Pricing</Button>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
