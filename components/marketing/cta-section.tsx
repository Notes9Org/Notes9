"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowRight, Zap, Users, Clock } from "lucide-react"
import { motion } from "framer-motion"

export function CTASection() {
  return (
    <section className="py-24 bg-gradient-to-r from-primary to-accent">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl text-balance mb-6">
            Join the Future of Research Today
          </h2>

          <p className="text-xl text-primary-foreground max-w-2xl mx-auto mb-8">
            Transform your research workflow with AI that truly understands science. Start accelerating discoveries in
            minutes, not months.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button
              size="lg"
              variant="secondary"
              className="text-lg px-8 py-6 bg-primary-foreground text-primary hover:bg-primary-foreground/90 animate-pulse-glow"
            >
              <Zap className="mr-2 h-5 w-5" />
              Experience Agentic Intelligence
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="text-lg px-8 py-6 border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 bg-transparent"
            >
              Request a Demo
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <Card className="p-6 bg-primary-foreground/10 backdrop-blur border-primary-foreground/20">
              <Users className="h-8 w-8 text-primary-foreground mx-auto mb-3" />
              <div className="text-2xl font-bold text-primary-foreground mb-1">1000+</div>
              <div className="text-sm text-primary-foreground/80">Researchers using AI</div>
            </Card>

            <Card className="p-6 bg-primary-foreground/10 backdrop-blur border-primary-foreground/20">
              <Clock className="h-8 w-8 text-primary-foreground mx-auto mb-3" />
              <div className="text-2xl font-bold text-primary-foreground mb-1">14 Days</div>
              <div className="text-sm text-primary-foreground/80">Free trial period</div>
            </Card>

            <Card className="p-6 bg-primary-foreground/10 backdrop-blur border-primary-foreground/20">
              <Zap className="h-8 w-8 text-primary-foreground mx-auto mb-3" />
              <div className="text-2xl font-bold text-primary-foreground mb-1">5 Min</div>
              <div className="text-sm text-primary-foreground/80">Setup time</div>
            </Card>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
