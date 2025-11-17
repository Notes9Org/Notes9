"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Play, ArrowRight, Brain, Zap, BookOpen, BarChart3, Users } from "lucide-react"
import { motion } from "framer-motion"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="hero-particles"></div>

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-32 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute -bottom-40 -left-32 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "4s" }}
        ></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Badge variant="secondary" className="mb-6 text-sm font-medium glass text-solid">
              <Brain className="mr-2 h-4 w-4" />
              Agentic Intelligence
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight text-solid sm:text-6xl lg:text-7xl text-balance">
              The First Agentic <span className="text-eln-lims font-mono">ELN+LIMS</span> Platform
            </h1>

            <p className="mt-6 text-xl text-solid sm:text-2xl text-balance font-light">
              AI that thinks with you, not just for you
            </p>

            <p className="mt-4 text-lg text-solid max-w-2xl mx-auto text-pretty font-light">
              Accelerate scientific discovery with agentic intelligence that proactively assists researchers throughout
              their entire workflow - from literature review to final reporting
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Button size="lg" className="text-lg px-8 py-6 glass text-solid hover:bg-white/30">
              <Zap className="mr-2 h-5 w-5" />
              Experience Agentic Intelligence
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="text-lg px-8 py-6 glass border-white/20 bg-transparent text-solid hover:bg-white/10"
            >
              <Play className="mr-2 h-5 w-5" />
              Watch 3-Min Demo
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-6 text-sm text-solid"
          >
            For forward-thinking research labs ready to embrace the future of scientific computing
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-16 mx-auto max-w-6xl"
        >
          <Card className="p-8 glass border-2 border-white/20 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 glass rounded-lg flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="font-semibold text-solid mb-2">Literature Intelligence</h3>
                <p className="text-sm text-solid font-light">AI scans databases, ranks papers, generates summaries</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 glass rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="font-semibold text-solid mb-2">Smart Inventory</h3>
                <p className="text-sm text-solid font-light">Real-time reagent tracking with procurement assistance</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 glass rounded-lg flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="font-semibold text-solid mb-2">AI-Powered Analysis</h3>
                <p className="text-sm text-solid font-light">Automated data processing and publication-ready graphs</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 glass rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="font-semibold text-solid mb-2">Team Collaboration</h3>
                <p className="text-sm text-solid font-light">Seamless knowledge sharing across research teams</p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
