"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, BookOpen, Database, Brain } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"

export function AcademicHero() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24 bg-background">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="outline" className="mb-6 text-sm font-medium border-primary/20 bg-primary/5 text-primary">
              <Brain className="mr-2 h-4 w-4" />
              Agentic Electronic Lab Notebook
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
              The Next Evolution of <br className="hidden sm:block" />
              <span className="text-primary">Scientific Intelligence</span>
            </h1>

            <p className="mt-6 text-xl text-muted-foreground sm:text-xl text-balance font-light leading-relaxed max-w-2xl mx-auto">
              An agentic ELN platform designed to proactively assist researchers with literature reviews, lab note organization, and AI-driven data analysis.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Button size="lg" className="text-md px-8 h-12" asChild>
              <Link href="/auth/sign-up">
                Request Pilot Access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="text-md px-8 h-12"
              asChild
            >
              <Link href="/platform">Explore Platform</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center border-t border-border pt-8 max-w-3xl mx-auto"
          >
            <div className="flex flex-col items-center">
              <div className="p-3 bg-primary/10 rounded-full mb-3">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Literature Review</h3>
              <p className="text-sm text-muted-foreground mt-1">Automated search & synthesis</p>
            </div>

            <div className="flex flex-col items-center">
              <div className="p-3 bg-primary/10 rounded-full mb-3">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Data Entry</h3>
              <p className="text-sm text-muted-foreground mt-1">Structured lab notes</p>
            </div>

            <div className="flex flex-col items-center">
              <div className="p-3 bg-primary/10 rounded-full mb-3">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">AI Analysis</h3>
              <p className="text-sm text-muted-foreground mt-1">RAG & Insight Generation</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
